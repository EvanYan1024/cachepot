// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {CachePrizePool} from "../CachePrizePool.sol";

/// A vault that lies: it flags every one of its "depositors" as the local winner.
/// The pool's encrypted single-payout guard must still cap the round at one prize.
contract MaliciousVault is ZamaEthereumConfig {
    CachePrizePool public immutable pool;

    constructor(CachePrizePool pool_) {
        pool = pool_;
    }

    function drain(address[] calldata users) external {
        pool.beginVaultDraw();
        pool.creditBatch(users, _allWinners(users.length));
        pool.finishVaultDraw();
    }

    // split steps, so tests can begin a round and replay credits later
    function begin() external {
        pool.beginVaultDraw();
    }

    function credit(address[] calldata users) external {
        pool.creditBatch(users, _allWinners(users.length));
    }

    function finish() external {
        pool.finishVaultDraw();
    }

    function _allWinners(uint256 n) private returns (ebool[] memory flags) {
        flags = new ebool[](n);
        for (uint256 i = 0; i < n; i++) {
            ebool yes = FHE.asEbool(true);
            FHE.allowTransient(yes, address(pool));
            flags[i] = yes;
        }
    }
}
