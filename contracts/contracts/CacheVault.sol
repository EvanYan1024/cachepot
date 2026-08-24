// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {CachePrizePool} from "./CachePrizePool.sol";

/// @dev The two Zama Confidential Vault (Earn) batchers share this quit shape.
interface IVaultBatcher {
    function quit(uint256 batchId) external returns (bytes32);
}

/// @title CacheVault — one confidential asset, one encrypted TWAB ledger
/// @notice Holds deposits of a single ERC7984 asset and picks that vault's local
/// winner from an encrypted time-weighted average balance. It never learns whether
/// its own vault won: the prize pool ANDs in an encrypted `vaultHit` flag and does
/// the crediting, so a vault cannot assert a payout for itself.
///
/// Weight model (encrypted TWAB): a user's chance for round R is the time integral
/// of their balance over R's accrual window [closedAt(R-1), closedAt(R)], tracked as
/// euint128 accumulators. Sniping a deposit right before the draw earns ~zero weight.
contract CacheVault is ZamaEthereumConfig {
    uint256 public constant MAX_PARTICIPANTS = 256;
    // ponytail: fixed >>8 weight normalization keeps rand*totalWeight inside euint128.
    // Ceiling: total balance-seconds per round < 2^72 (~$4.6M TVL on weekly rounds at
    // 6 decimals); raise the shift or move target math to euint256 beyond that.
    uint8 public constant WEIGHT_SHIFT = 8;

    IERC7984 public immutable token;
    CachePrizePool public immutable pool;

    // Optional Zama Earn (Confidential Vault) wiring — zero addresses disable it.
    // The strategist can only move funds between this vault and the two official
    // batchers, never to a wallet: it controls timing, not custody.
    IERC7984 public immutable shareToken;
    address public immutable depositBatcher;
    address public immutable redeemBatcher;
    address public immutable strategist;

    bool public drawing;
    uint256 public drawRound; // pool round currently being scanned
    uint256 public windowStart; // accrual window start = pool.closedAt() of the last draw
    uint256 public prevWindowStart; // start of the window the last beginDraw consumed
    uint256 public cursor;

    address[] public participants;
    mapping(address => bool) public isParticipant;
    mapping(address => euint64) private _balance;
    mapping(address => euint128) private _accCur; // weight accruing in user's current window
    mapping(address => euint128) private _accPrev; // finalized weight while one window behind
    mapping(address => uint256) private _userWindow; // windowStart value _accCur belongs to
    mapping(address => uint256) private _lastTouch;

    euint64 private _totalBalance; // invariant: sum of all _balance
    euint128 private _totalAcc; // global weight accrual for the current window
    euint128 private _totalAccPrev; // finalized global weight of the closing window
    uint256 private _globalWindow; // boundary _totalAccPrev belongs to
    uint256 private _globalLastTouch;

    // draw accumulators, carried across advanceDraw transactions
    euint64 private _target;
    euint64 private _cum;
    ebool private _found;

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);
    event DrawStarted(uint256 indexed roundId);
    event DrawAdvanced(uint256 indexed roundId, uint256 from, uint256 to);
    event SweptToEarn(uint64 requested);
    event RedeemedFromEarn(uint64 requested);

    constructor(
        IERC7984 token_,
        CachePrizePool pool_,
        IERC7984 shareToken_,
        address depositBatcher_,
        address redeemBatcher_,
        address strategist_
    ) {
        token = token_;
        pool = pool_;
        shareToken = shareToken_;
        depositBatcher = depositBatcher_;
        redeemBatcher = redeemBatcher_;
        strategist = strategist_;
        windowStart = block.timestamp;
        prevWindowStart = block.timestamp;
        _globalLastTouch = block.timestamp;
        _totalBalance = FHE.asEuint64(0);
        _totalAcc = FHE.asEuint128(0);
        _totalAccPrev = FHE.asEuint128(0);
        FHE.allowThis(_totalBalance);
        FHE.allowThis(_totalAcc);
        FHE.allowThis(_totalAccPrev);
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
            _userWindow[msg.sender] = _currentWindow();
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

        // clamp to the user's ledger balance AND to what the vault actually holds —
        // principal swept into Earn batches can leave the buffer short, and an
        // unclamped ERC7984 transfer would silently send zero (C4) while the ledger
        // still decremented. Withdrawals degrade to "what the buffer can pay now".
        euint64 sent = FHE.min(requested, _balance[msg.sender]);
        sent = FHE.min(sent, token.confidentialBalanceOf(address(this)));
        FHE.allowTransient(sent, address(token));
        token.confidentialTransfer(msg.sender, sent);

        _balance[msg.sender] = FHE.sub(_balance[msg.sender], sent);
        _totalBalance = FHE.sub(_totalBalance, sent);
        _persistUser(msg.sender);
        FHE.allowThis(_totalBalance);
        FHE.allow(sent, msg.sender);
        emit Withdrawn(msg.sender);
    }

    // -------------------------------------------------------------------- earn

    /// @notice Sends up to `amount` idle asset tokens into the Earn deposit batcher;
    /// the resulting cShares are claimed back for this vault permissionlessly via the
    /// batcher's own claim(batchId, vault). Clamped to the actual balance so the
    /// transfer cannot silently zero out (C4).
    function sweepToEarn(uint64 amount) external {
        require(msg.sender == strategist, "not strategist");
        require(depositBatcher != address(0), "earn disabled");
        euint64 amt = FHE.min(FHE.asEuint64(amount), token.confidentialBalanceOf(address(this)));
        FHE.allowTransient(amt, address(token));
        token.confidentialTransferAndCall(depositBatcher, amt, "");
        emit SweptToEarn(amount);
    }

    /// @notice Sends up to `shares` cShares into the Earn redeem batcher to refill
    /// the withdrawal buffer; the asset tokens are claimed back the same way.
    function redeemFromEarn(uint64 shares) external {
        require(msg.sender == strategist, "not strategist");
        require(redeemBatcher != address(0), "earn disabled");
        euint64 amt = FHE.min(FHE.asEuint64(shares), shareToken.confidentialBalanceOf(address(this)));
        FHE.allowTransient(amt, address(shareToken));
        shareToken.confidentialTransferAndCall(redeemBatcher, amt, "");
        emit RedeemedFromEarn(shares);
    }

    /// @notice Recovers this vault's funds from a canceled batch. Permissionless —
    /// the batcher refunds the depositor, so funds can only land back here.
    function quitEarn(address batcher, uint256 batchId) external {
        require(batcher == depositBatcher || batcher == redeemBatcher, "unknown batcher");
        IVaultBatcher(batcher).quit(batchId);
    }

    // -------------------------------------------------------------------- draw

    /// @notice Starts this vault's scan for the pool's open draw. Permissionless.
    function beginDraw() external {
        // a scan left dangling by pool.skipVault is dead once the pool moved on; restart
        require(!drawing || pool.roundId() != drawRound, "already drawing");
        require(pool.state() == CachePrizePool.State.Drawing, "pool not drawing");
        require(participants.length > 0, "no participants");

        uint256 closedAt = pool.closedAt();
        require(closedAt > windowStart, "round already drawn");

        // settle the weight earned up to the pool's close, then open the next window
        euint128 closedWeight;
        if (_globalWindow == closedAt) {
            closedWeight = _totalAccPrev; // a deposit already finalized this segment
        } else {
            closedWeight = FHE.add(
                _totalAcc,
                FHE.mul(FHE.asEuint128(_totalBalance), uint128(closedAt - _globalLastTouch))
            );
            _totalAcc = FHE.mul(FHE.asEuint128(_totalBalance), uint128(block.timestamp - closedAt));
            _globalLastTouch = block.timestamp;
        }
        euint64 totalW = FHE.asEuint64(FHE.shr(closedWeight, WEIGHT_SHIFT));

        // target = (rand * totalWeight) >> 64, uniform in [0, totalWeight).
        // Sidesteps mod-by-ciphertext; a winner exists whenever totalWeight > 0
        // (shift truncation can starve the last slot with probability ~n/2^64;
        // the prize then simply stays in the pool's reserve)
        euint64 rand = FHE.randEuint64();
        _target = FHE.asEuint64(FHE.shr(FHE.mul(FHE.asEuint128(rand), FHE.asEuint128(totalW)), 64));
        _cum = FHE.asEuint64(0);
        _found = FHE.asEbool(false);
        FHE.allowThis(_target);
        FHE.allowThis(_cum);
        FHE.allowThis(_found);

        prevWindowStart = windowStart;
        windowStart = closedAt;
        FHE.allowThis(_totalAcc);

        pool.beginVaultDraw();

        cursor = 0;
        drawing = true;
        drawRound = pool.roundId();
        emit DrawStarted(drawRound);
    }

    /// @notice Advances the encrypted prefix-sum scan by `batchSize` participants.
    /// Permissionless; accumulators persist across transactions (HCU depth limit).
    function advanceDraw(uint256 batchSize) external {
        require(drawing, "not drawing");
        uint256 end = cursor + batchSize;
        if (end > participants.length) end = participants.length;
        require(end > cursor, "empty batch");

        euint64 cum = _cum;
        ebool found = _found;

        address[] memory batch = new address[](end - cursor);
        ebool[] memory localWinner = new ebool[](end - cursor);

        for (uint256 i = cursor; i < end; i++) {
            address p = participants[i];

            // settle the closed round's weight and roll the user into the new window
            euint128 w128;
            if (_userWindow[p] == windowStart) {
                // touched (or registered) after the close: weight was finalized then
                w128 = _accPrev[p];
                _accCur[p] = FHE.add(
                    _accCur[p],
                    FHE.mul(FHE.asEuint128(_balance[p]), uint128(block.timestamp - _lastTouch[p]))
                );
            } else if (_userWindow[p] == prevWindowStart) {
                // untouched since the close: settle lazily
                w128 = FHE.add(
                    _accCur[p],
                    FHE.mul(FHE.asEuint128(_balance[p]), uint128(windowStart - _lastTouch[p]))
                );
                _accCur[p] = FHE.mul(FHE.asEuint128(_balance[p]), uint128(block.timestamp - windowStart));
                _userWindow[p] = windowStart;
            } else {
                // stranded two or more windows behind by dead (skipped) scans: the stale
                // weight belongs to rounds that paid nobody and is discarded. Untouched
                // since before the drawn window opened, so the balance was constant
                // across it and the exact weight is balance * window length.
                w128 = FHE.mul(FHE.asEuint128(_balance[p]), uint128(windowStart - prevWindowStart));
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

            batch[i - cursor] = p;
            localWinner[i - cursor] = isWinner;
            FHE.allowTransient(isWinner, address(pool));
        }

        _cum = cum;
        _found = found;
        FHE.allowThis(_cum);
        FHE.allowThis(_found);

        // the pool computes the prize amount; this vault only asserts local winners
        pool.creditBatch(batch, localWinner);

        emit DrawAdvanced(drawRound, cursor, end);
        cursor = end;

        if (end == participants.length) {
            drawing = false;
            pool.finishVaultDraw();
        }
    }

    // ------------------------------------------------------------ twab settling

    /// @dev Deposits can land between the pool closing a round and this vault starting
    /// its scan. The global accumulator therefore needs the same two-segment split as a
    /// user's: weight earned before the close is finalized into _totalAccPrev, and the
    /// remainder opens the next window.
    function _settleGlobal() private {
        euint128 bal = FHE.asEuint128(_totalBalance);
        uint256 boundary = _pendingBoundary();
        if (boundary != 0 && _globalLastTouch < boundary) {
            _totalAccPrev = FHE.add(_totalAcc, FHE.mul(bal, uint128(boundary - _globalLastTouch)));
            _totalAcc = FHE.mul(bal, uint128(block.timestamp - boundary));
            _globalWindow = boundary;
            FHE.allowThis(_totalAccPrev);
        } else {
            _totalAcc = FHE.add(_totalAcc, FHE.mul(bal, uint128(block.timestamp - _globalLastTouch)));
        }
        FHE.allowThis(_totalAcc);
        _globalLastTouch = block.timestamp;
    }

    /// @dev The close timestamp of a round this vault has not scanned yet, or 0.
    function _pendingBoundary() private view returns (uint256) {
        // only a live scan owns the current boundary; a dangling one (skipped by the
        // pool) must not swallow a later round's close into simple accrual
        bool scanning = drawing && pool.roundId() == drawRound;
        if (scanning || pool.state() != CachePrizePool.State.Drawing) return 0;
        uint256 closedAt = pool.closedAt();
        return closedAt > windowStart ? closedAt : 0;
    }

    /// @dev The boundary the *next* weight segment starts at. Normally this vault's
    /// windowStart, but once the pool has closed a round we have not scanned yet, that
    /// close is already the boundary — otherwise a deposit landing in between would be
    /// settled into the wrong round and underflow the elapsed-time subtraction.
    function _currentWindow() private view returns (uint256) {
        uint256 boundary = _pendingBoundary();
        return boundary != 0 ? boundary : windowStart;
    }

    /// @dev Two-segment settle: weight earned before the last close is finalized into
    /// _accPrev, the remainder starts the new window. A successful scan rolls every
    /// participant forward, but a dead (skipped) scan strands the unvisited — a user
    /// can therefore be two or more windows behind, and the stale windows' weight
    /// belongs to rounds that paid nobody: it is discarded, not settled.
    function _settleUser(address user) private {
        euint128 bal = FHE.asEuint128(_balance[user]);
        uint256 window = _currentWindow();
        // the boundary a one-window-behind user sits at; anything older is stranded
        uint256 base = window == windowStart ? prevWindowStart : windowStart;
        if (_userWindow[user] == window) {
            _accCur[user] = FHE.add(_accCur[user], FHE.mul(bal, uint128(block.timestamp - _lastTouch[user])));
        } else if (_userWindow[user] == base) {
            _accPrev[user] = FHE.add(_accCur[user], FHE.mul(bal, uint128(window - _lastTouch[user])));
            _accCur[user] = FHE.mul(bal, uint128(block.timestamp - window));
            _userWindow[user] = window;
            FHE.allowThis(_accPrev[user]);
        } else {
            // stranded: untouched since before `base`, so the balance was constant
            // across the whole window [base, window]
            _accPrev[user] = FHE.mul(bal, uint128(window - base));
            _accCur[user] = FHE.mul(bal, uint128(block.timestamp - window));
            _userWindow[user] = window;
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

    function participantCount() external view returns (uint256) {
        return participants.length;
    }
}
