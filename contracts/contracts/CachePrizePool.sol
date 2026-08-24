// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC7984Wrapper is IERC7984 {
    function wrap(address to, uint256 amount) external returns (euint64);
    function underlying() external view returns (address);
    function rate() external view returns (uint256);
}

/// @title CachePrizePool — one shared prize pool over many confidential vaults
/// @notice Mirrors PoolTogether V5's two-level model: vaults contribute prize tokens
/// (public, verifiable amounts) which buy their share of the odds, and the winner
/// inside a vault is drawn from that vault's encrypted TWAB.
///
/// Where it goes further than V5: the *winning vault* is itself an encrypted boolean,
/// so no observer learns which vault — let alone which address — took the prize. Every
/// depositor of every vault is credited each round; all but one credit is an encrypted
/// zero. The anonymity set is the entire protocol, not a single vault.
contract CachePrizePool is ZamaEthereumConfig {
    enum State {
        Open,
        Drawing
    }

    uint256 public constant MAX_VAULTS = 32;
    /// A pending vault silent this long after the close can be skipped by anyone, so a
    /// junk registration (or a funded vault with no depositors) cannot stall the round.
    uint256 public constant DRAW_GRACE = 1 hours;

    IERC7984Wrapper public immutable prizeToken;
    IERC20 public immutable underlying;
    uint256 public immutable roundPeriod;

    State public state;
    uint256 public roundId;
    uint256 public openedAt;
    uint256 public closedAt; // every vault uses this as its TWAB window boundary

    address[] public vaults;
    mapping(address => bool) public isVault;

    /// Public by design, exactly as in V5: contributions are what buy a vault's odds.
    mapping(address => uint256) public contribution;
    uint256 public totalContribution;

    // ------------------------------------------------------------ per-round state
    mapping(address => uint256) private _cumStart; // frozen odds interval, plaintext
    mapping(address => uint256) private _cumEnd;
    mapping(address => ebool) private _vaultHit; // encrypted "this vault won"
    mapping(address => bool) public vaultDrawn;
    mapping(address => uint256) private _beganIn; // roundId + 1 of the vault's last beginVaultDraw
    uint256 public vaultsPending;
    euint64 private _roundPrize;
    ebool private _awarded; // at most one payout per round, enforced under encryption
    euint64 private _vaultTarget;

    /// Prize tokens held for future draws. Publicly decryptable so the UI can show it.
    euint64 private _reserve;
    mapping(address => euint64) private _prizeBalance;
    mapping(address => ebool) private _wonLastRound;
    mapping(address => uint256) private _wonRound; // round the flag above belongs to

    event VaultRegistered(address indexed vault);
    event Contributed(address indexed vault, address indexed from, uint256 amount);
    event RoundClosed(uint256 indexed roundId, uint256 totalContribution);
    event VaultFinished(uint256 indexed roundId, address indexed vault);
    event VaultSkipped(uint256 indexed roundId, address indexed vault);
    event RoundAwarded(uint256 indexed roundId);
    event PrizeClaimed(address indexed user);

    modifier onlyVault() {
        require(isVault[msg.sender], "not a vault");
        _;
    }

    constructor(IERC7984Wrapper prizeToken_, uint256 period) {
        prizeToken = prizeToken_;
        underlying = IERC20(prizeToken_.underlying());
        roundPeriod = period;
        openedAt = block.timestamp;
        _reserve = FHE.asEuint64(0);
        _awarded = FHE.asEbool(false);
        FHE.allowThis(_reserve);
        FHE.allowThis(_awarded);
        FHE.makePubliclyDecryptable(_reserve);
    }

    // --------------------------------------------------------------- registration

    /// @notice Permissionless: a vault's odds are bounded by what it contributes, so
    /// an unfunded vault buys nothing. Same trust argument as V5.
    function registerVault(address vault) external {
        require(!isVault[vault], "already registered");
        require(vaults.length < MAX_VAULTS, "full");
        require(state == State.Open, "drawing");
        isVault[vault] = true;
        vaults.push(vault);
        emit VaultRegistered(vault);
    }

    /// @notice Contribute prize tokens on behalf of `vault`, buying it odds for this
    /// round. Takes the *plain* ERC-20 and wraps it here, so the amount that sets the
    /// odds is verified on-chain rather than claimed — an encrypted transfer could
    /// silently move zero (C4) and leave the plaintext claim unbacked.
    function contribute(address vault, uint256 amount) external {
        require(state == State.Open, "drawing");
        require(isVault[vault], "not a vault");
        // confidential units actually minted; floor the pull so no dust is stranded
        uint256 units = amount / prizeToken.rate();
        require(units > 0 && units <= type(uint64).max, "bad amount");
        uint256 pull = units * prizeToken.rate();

        require(underlying.transferFrom(msg.sender, address(this), pull), "transfer failed");
        require(underlying.approve(address(prizeToken), pull), "approve failed");
        prizeToken.wrap(address(this), pull);

        contribution[vault] += units;
        totalContribution += units;
        _reserve = FHE.add(_reserve, FHE.asEuint64(uint64(units)));
        FHE.allowThis(_reserve);
        FHE.makePubliclyDecryptable(_reserve);
        emit Contributed(vault, msg.sender, units);
    }

    // ----------------------------------------------------------------------- draw

    /// @notice Closes the round and commits the encrypted vault target. Permissionless.
    function closeRound() external {
        require(state == State.Open, "not open");
        require(block.timestamp >= openedAt + roundPeriod, "too early");
        require(totalContribution > 0, "no prize");

        // vaultTarget uniform in [0, totalContribution): the bounds are plaintext, so
        // this is a scalar multiply — L1 costs almost nothing next to the L2 scan
        euint64 rand = FHE.randEuint64();
        _vaultTarget = FHE.asEuint64(FHE.shr(FHE.mul(FHE.asEuint128(rand), uint128(totalContribution)), 64));
        FHE.allowThis(_vaultTarget);

        uint256 cum = 0;
        uint256 pending = 0;
        for (uint256 i = 0; i < vaults.length; i++) {
            address v = vaults[i];
            _cumStart[v] = cum;
            cum += contribution[v];
            _cumEnd[v] = cum;
            vaultDrawn[v] = false;
            if (contribution[v] > 0) pending += 1;
        }
        vaultsPending = pending;

        _roundPrize = _reserve;
        _awarded = FHE.asEbool(false);
        FHE.allowThis(_roundPrize);
        FHE.allowThis(_awarded);

        closedAt = block.timestamp;
        state = State.Drawing;
        emit RoundClosed(roundId, totalContribution);
    }

    /// @notice Called by a vault when it starts its scan. Computes and stores the
    /// encrypted "the prize landed in this vault" flag that creditBatch ANDs in.
    function beginVaultDraw() external onlyVault {
        require(state == State.Drawing, "not drawing");
        require(!vaultDrawn[msg.sender], "already drawn");
        require(contribution[msg.sender] > 0, "no odds this round");

        ebool hit = FHE.and(
            FHE.ge(_vaultTarget, uint64(_cumStart[msg.sender])),
            FHE.lt(_vaultTarget, uint64(_cumEnd[msg.sender]))
        );
        _vaultHit[msg.sender] = hit;
        FHE.allowThis(hit);
        _beganIn[msg.sender] = roundId + 1;
    }

    /// @notice Credits a batch of a vault's depositors. The vault only asserts encrypted
    /// "this is my local winner" flags; the prize *amount* is computed here, and the
    /// global `_awarded` flag caps the protocol at one payout per round — so a malicious
    /// vault flagging everybody still cannot drain the reserve.
    function creditBatch(address[] calldata users, ebool[] calldata localWinner) external onlyVault {
        require(state == State.Drawing, "not drawing");
        require(!vaultDrawn[msg.sender], "already drawn");
        // a vault skipped mid-scan keeps its stale winner flags and vaultHit; without
        // this check it could replay them into a later round it bought no odds in
        require(_beganIn[msg.sender] == roundId + 1, "not begun this round");
        require(users.length == localWinner.length, "length mismatch");

        ebool hit = _vaultHit[msg.sender];
        ebool awarded = _awarded;
        euint64 prize = _roundPrize;
        euint64 zero = FHE.asEuint64(0);

        for (uint256 i = 0; i < users.length; i++) {
            address u = users[i];
            ebool win = FHE.and(FHE.and(localWinner[i], hit), FHE.not(awarded));
            awarded = FHE.or(awarded, win);

            _prizeBalance[u] = FHE.add(_prizeBalance[u], FHE.select(win, prize, zero));
            FHE.allowThis(_prizeBalance[u]);
            FHE.allow(_prizeBalance[u], u);

            // the only truthful "did I win" signal: local winner AND winning vault.
            // OR within the round — a user saved in several vaults is credited by
            // each scan, and a later vault's zero flag must not clobber the win
            if (_wonRound[u] == roundId) {
                _wonLastRound[u] = FHE.or(_wonLastRound[u], win);
            } else {
                _wonLastRound[u] = win;
                _wonRound[u] = roundId;
            }
            FHE.allowThis(_wonLastRound[u]);
            FHE.allow(_wonLastRound[u], u);
        }

        _awarded = awarded;
        FHE.allowThis(_awarded);
    }

    /// @notice A vault reports its scan complete. The round settles once every funded
    /// vault has been scanned; an unclaimed prize simply stays in the reserve.
    function finishVaultDraw() external onlyVault {
        require(state == State.Drawing, "not drawing");
        require(!vaultDrawn[msg.sender], "already drawn");
        require(_beganIn[msg.sender] == roundId + 1, "not begun this round");
        _finishVault(msg.sender);
    }

    /// @notice Skips a vault that has not completed its scan within DRAW_GRACE of the
    /// close. Permissionless: without it, one junk registration funded with dust — or a
    /// funded vault with no depositors — would leave the round in Drawing forever. If
    /// no batch had credited a winner before the skip, `_awarded` stays false and the
    /// prize rolls over — the same path as a zero-weight round.
    function skipVault(address vault) external {
        require(state == State.Drawing, "not drawing");
        require(block.timestamp >= closedAt + DRAW_GRACE, "grace not over");
        require(!vaultDrawn[vault] && contribution[vault] > 0, "not pending");
        emit VaultSkipped(roundId, vault);
        _finishVault(vault);
    }

    function _finishVault(address vault) private {
        vaultDrawn[vault] = true;
        vaultsPending -= 1;
        emit VaultFinished(roundId, vault);

        if (vaultsPending == 0) {
            _reserve = FHE.sub(_reserve, FHE.select(_awarded, _roundPrize, FHE.asEuint64(0)));
            FHE.allowThis(_reserve);
            FHE.makePubliclyDecryptable(_reserve);

            for (uint256 i = 0; i < vaults.length; i++) contribution[vaults[i]] = 0;
            totalContribution = 0;

            emit RoundAwarded(roundId);
            roundId += 1;
            openedAt = block.timestamp;
            state = State.Open;
        }
    }

    // ---------------------------------------------------------------------- claim

    /// @notice Sends the caller's encrypted prize balance out as prize tokens. Losers
    /// can call it too and move an encrypted zero — the call itself proves nothing.
    function claim() external {
        euint64 amount = _prizeBalance[msg.sender];
        require(euint64.unwrap(amount) != 0, "nothing to claim");

        FHE.allowTransient(amount, address(prizeToken));
        prizeToken.confidentialTransfer(msg.sender, amount);

        _prizeBalance[msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(_prizeBalance[msg.sender]);
        FHE.allow(_prizeBalance[msg.sender], msg.sender);
        emit PrizeClaimed(msg.sender);
    }

    // ---------------------------------------------------------------------- views

    function prizeBalanceOf(address user) external view returns (euint64) {
        return _prizeBalance[user];
    }

    function wonLastRound(address user) external view returns (ebool) {
        return _wonLastRound[user];
    }

    /// @dev Publicly decryptable via the SDK.
    function reserve() external view returns (euint64) {
        return _reserve;
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    /// @dev This round's odds interval for a vault, in prize-token units.
    function oddsOf(address vault) external view returns (uint256 start, uint256 end) {
        return (_cumStart[vault], _cumEnd[vault]);
    }
}
