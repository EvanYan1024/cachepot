// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title CachePot — confidential no-loss lottery on ERC7984 confidential tokens
/// @notice Deposits, balances, time-weighted draw odds and the winner's identity stay
/// encrypted end to end. The draw runs as permissionless on-chain transactions anyone
/// can verify and advance. Principal is withdrawable at any time, including mid-draw.
///
/// Weight model (encrypted TWAB): a user's chance for round R is the time integral of
/// their balance over R's accrual window [closeTime(R-1), closeTime(R)], tracked as
/// euint128 accumulators. Sniping a deposit right before the draw earns ~zero weight.
contract CachePot is ZamaEthereumConfig {
    enum State {
        Open,
        Drawing
    }

    uint256 public constant MAX_PARTICIPANTS = 256;
    // ponytail: fixed >>8 weight normalization keeps rand*totalWeight inside euint128.
    // Ceiling: total balance-seconds per round < 2^72 (~$4.6M TVL on weekly rounds at
    // 6 decimals); raise the shift or move target math to euint256 beyond that.
    uint8 public constant WEIGHT_SHIFT = 8;

    IERC7984 public immutable token;
    uint256 public immutable roundPeriod;

    State public state;
    uint256 public roundId;
    uint256 public openedAt;
    uint256 public windowStart; // accrual window start = timestamp of last closeRound
    uint256 public cursor;
    bool public prizeFunded;

    address[] public participants;
    mapping(address => bool) public isParticipant;
    mapping(address => euint64) private _balance;
    mapping(address => euint128) private _accCur; // weight accruing in user's current window
    mapping(address => euint128) private _accPrev; // finalized weight while one window behind
    mapping(address => uint256) private _userWindow; // windowStart value _accCur belongs to
    mapping(address => uint256) private _lastTouch;
    mapping(address => ebool) private _winnerFlag;

    euint64 private _totalBalance; // invariant: sum of all _balance
    euint128 private _totalAcc; // global weight accrual for the current window
    uint256 private _globalLastTouch;

    // encrypted prize pot; marked publicly decryptable so the UI can display it.
    // Unawarded prize (zero-total-weight edge) rolls over to the next round.
    euint64 private _prizePot;

    // draw accumulators, carried across advanceDraw transactions
    euint64 private _target;
    euint64 private _cum;
    ebool private _found;

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);
    event PrizeFunded(uint256 indexed roundId);
    event RoundClosed(uint256 indexed roundId);
    event DrawAdvanced(uint256 indexed roundId, uint256 from, uint256 to);
    event RoundAwarded(uint256 indexed roundId);

    constructor(IERC7984 token_, uint256 period) {
        token = token_;
        roundPeriod = period;
        openedAt = block.timestamp;
        windowStart = block.timestamp;
        _globalLastTouch = block.timestamp;
        _totalBalance = FHE.asEuint64(0);
        _totalAcc = FHE.asEuint128(0);
        _prizePot = FHE.asEuint64(0);
        FHE.allowThis(_totalBalance);
        FHE.allowThis(_totalAcc);
        FHE.allowThis(_prizePot);
        FHE.makePubliclyDecryptable(_prizePot); // pot size is public from day one
    }

    // ---------------------------------------------------------------- deposits

    function deposit(externalEuint64 encAmount, bytes calldata proof) external {
        euint64 amount = FHE.fromExternal(encAmount, proof);
        if (!isParticipant[msg.sender]) {
            require(participants.length < MAX_PARTICIPANTS, "full");
            isParticipant[msg.sender] = true;
            participants.push(msg.sender);
            _balance[msg.sender] = FHE.asEuint64(0);
            _accCur[msg.sender] = FHE.asEuint128(0);
            _accPrev[msg.sender] = FHE.asEuint128(0);
            _userWindow[msg.sender] = windowStart;
            _lastTouch[msg.sender] = block.timestamp;
            FHE.allowThis(_accPrev[msg.sender]);
        } else {
            _settleUser(msg.sender);
        }
        _settleGlobal();

        // ledger truth is the token's returned amount: ERC7984 transfers the full
        // amount or an encrypted zero when the sender's balance is short (C4)
        FHE.allowTransient(amount, address(token));
        euint64 received = token.confidentialTransferFrom(msg.sender, address(this), amount);

        _balance[msg.sender] = FHE.add(_balance[msg.sender], received);
        _totalBalance = FHE.add(_totalBalance, received);
        _persistUser(msg.sender);
        FHE.allowThis(_totalBalance);
        emit Deposited(msg.sender);
    }

    function withdraw(externalEuint64 encAmount, bytes calldata proof) external {
        require(isParticipant[msg.sender], "not participant");
        euint64 requested = FHE.fromExternal(encAmount, proof);
        _settleUser(msg.sender);
        _settleGlobal();

        // clamp to the user's ledger balance; the pot always holds at least the
        // ledger total, so the token-side transfer cannot silently fail
        euint64 sent = FHE.min(requested, _balance[msg.sender]);
        FHE.allowTransient(sent, address(token));
        token.confidentialTransfer(msg.sender, sent);

        _balance[msg.sender] = FHE.sub(_balance[msg.sender], sent);
        _totalBalance = FHE.sub(_totalBalance, sent);
        _persistUser(msg.sender);
        FHE.allowThis(_totalBalance);
        FHE.allow(sent, msg.sender);
        emit Withdrawn(msg.sender);
    }

    /// @dev Prize is frozen while Drawing so every scan batch works with one pot value.
    function fundPrize(externalEuint64 encAmount, bytes calldata proof) external {
        require(state == State.Open, "not open");
        euint64 amount = FHE.fromExternal(encAmount, proof);
        FHE.allowTransient(amount, address(token));
        euint64 received = token.confidentialTransferFrom(msg.sender, address(this), amount);
        _prizePot = FHE.add(_prizePot, received);
        FHE.allowThis(_prizePot);
        FHE.makePubliclyDecryptable(_prizePot);
        // ponytail: plaintext claim; a broke sponsor yields a zero-prize round, harmless
        prizeFunded = true;
        emit PrizeFunded(roundId);
    }

    // -------------------------------------------------------------------- draw

    /// @notice Ends the round and commits the encrypted random target. Permissionless.
    function closeRound() external {
        require(state == State.Open, "not open");
        require(block.timestamp >= openedAt + roundPeriod, "too early");
        require(participants.length > 0, "no participants");
        require(prizeFunded, "no prize");

        _settleGlobal(); // _totalAcc now holds this round's total weight
        euint64 totalW = FHE.asEuint64(FHE.shr(_totalAcc, WEIGHT_SHIFT));

        // target = (rand * totalWeight) >> 64, uniform in [0, totalWeight).
        // Sidesteps mod-by-ciphertext; a winner exists whenever totalWeight > 0
        // (shift truncation can starve the last slot with probability ~n/2^64;
        // the prize then simply rolls over)
        euint64 rand = FHE.randEuint64();
        euint128 wide = FHE.mul(FHE.asEuint128(rand), FHE.asEuint128(totalW));
        _target = FHE.asEuint64(FHE.shr(wide, 64));
        _cum = FHE.asEuint64(0);
        _found = FHE.asEbool(false);
        FHE.allowThis(_target);
        FHE.allowThis(_cum);
        FHE.allowThis(_found);

        windowStart = block.timestamp; // next round's accrual window begins now
        _totalAcc = FHE.asEuint128(0);
        FHE.allowThis(_totalAcc);
        _globalLastTouch = block.timestamp;

        cursor = 0;
        state = State.Drawing;
        emit RoundClosed(roundId);
    }

    /// @notice Advances the encrypted prefix-sum scan by `batchSize` participants.
    /// Permissionless; accumulators persist across transactions (HCU depth limit).
    function advanceDraw(uint256 batchSize) external {
        require(state == State.Drawing, "not drawing");
        uint256 end = cursor + batchSize;
        if (end > participants.length) end = participants.length;
        require(end > cursor, "empty batch");

        euint64 cum = _cum;
        ebool found = _found;
        euint64 encPrize = _prizePot;
        euint64 zero64 = FHE.asEuint64(0);

        for (uint256 i = cursor; i < end; i++) {
            address p = participants[i];

            // settle the closed round's weight and roll the user into the new window
            euint128 w128;
            if (_userWindow[p] == windowStart) {
                // touched (or registered) after closeRound: weight was finalized then
                w128 = _accPrev[p];
                _accCur[p] = FHE.add(
                    _accCur[p],
                    FHE.mul(FHE.asEuint128(_balance[p]), uint128(block.timestamp - _lastTouch[p]))
                );
            } else {
                // untouched since closeRound: settle lazily
                w128 = FHE.add(
                    _accCur[p],
                    FHE.mul(FHE.asEuint128(_balance[p]), uint128(windowStart - _lastTouch[p]))
                );
                _accCur[p] = FHE.mul(FHE.asEuint128(_balance[p]), uint128(block.timestamp - windowStart));
                _userWindow[p] = windowStart;
            }
            _lastTouch[p] = block.timestamp;
            FHE.allowThis(_accCur[p]);

            euint64 w = FHE.asEuint64(FHE.shr(w128, WEIGHT_SHIFT));
            cum = FHE.add(cum, w);
            ebool hit = FHE.lt(_target, cum);
            ebool isWinner = FHE.and(hit, FHE.not(found));
            found = FHE.or(found, hit);
            _winnerFlag[p] = isWinner;
            FHE.allowThis(isWinner);
            FHE.allow(isWinner, p);

            // award merged into the scan: losers receive an encrypted zero,
            // indistinguishable on-chain from the winner's prize credit
            _balance[p] = FHE.add(_balance[p], FHE.select(isWinner, encPrize, zero64));
            FHE.allowThis(_balance[p]);
            FHE.allow(_balance[p], p);
        }

        _cum = cum;
        _found = found;
        FHE.allowThis(_cum);
        FHE.allowThis(_found);
        emit DrawAdvanced(roundId, cursor, end);
        cursor = end;

        if (end == participants.length) {
            _settleGlobal(); // settle the new window before the prize enters the ledger
            euint64 credited = FHE.select(found, encPrize, zero64);
            _totalBalance = FHE.add(_totalBalance, credited);
            _prizePot = FHE.sub(_prizePot, credited); // unawarded prize rolls over
            FHE.allowThis(_totalBalance);
            FHE.allowThis(_prizePot);
            FHE.makePubliclyDecryptable(_prizePot);
            prizeFunded = false;
            emit RoundAwarded(roundId);
            roundId += 1;
            openedAt = block.timestamp;
            state = State.Open;
        }
    }

    // ------------------------------------------------------------ twab settling

    function _settleGlobal() private {
        _totalAcc = FHE.add(
            _totalAcc,
            FHE.mul(FHE.asEuint128(_totalBalance), uint128(block.timestamp - _globalLastTouch))
        );
        FHE.allowThis(_totalAcc);
        _globalLastTouch = block.timestamp;
    }

    /// @dev Scan visits every participant every round, so a user is never more than
    /// one accrual window behind. Two-segment settle: weight earned before the last
    /// closeRound is finalized into _accPrev, the remainder starts the new window.
    function _settleUser(address user) private {
        euint128 bal = FHE.asEuint128(_balance[user]);
        if (_userWindow[user] == windowStart) {
            _accCur[user] = FHE.add(_accCur[user], FHE.mul(bal, uint128(block.timestamp - _lastTouch[user])));
        } else {
            _accPrev[user] = FHE.add(_accCur[user], FHE.mul(bal, uint128(windowStart - _lastTouch[user])));
            _accCur[user] = FHE.mul(bal, uint128(block.timestamp - windowStart));
            _userWindow[user] = windowStart;
            FHE.allowThis(_accPrev[user]);
        }
        _lastTouch[user] = block.timestamp;
    }

    function _persistUser(address user) private {
        FHE.allowThis(_balance[user]);
        FHE.allow(_balance[user], user);
        FHE.allowThis(_accCur[user]);
    }

    // ------------------------------------------------------------------- views

    function balanceOf(address user) external view returns (euint64) {
        return _balance[user];
    }

    /// @dev Flag from the most recently awarded round the user was scanned in.
    function winnerFlagOf(address user) external view returns (ebool) {
        return _winnerFlag[user];
    }

    /// @dev Publicly decryptable via the relayer SDK.
    function prizePot() external view returns (euint64) {
        return _prizePot;
    }

    function participantCount() external view returns (uint256) {
        return participants.length;
    }
}
