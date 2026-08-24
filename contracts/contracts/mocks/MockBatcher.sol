// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// Stand-in for a Zama Confidential Vault batcher with the real lifecycle rules:
/// per-batch deposits, a settable state machine, and quit gated to Pending or
/// Canceled — mirroring OpenZeppelin's BatcherConfidential.
contract MockBatcher is ZamaEthereumConfig {
    IERC7984 public immutable token;
    uint256 public currentBatchId = 1;
    mapping(uint256 => uint8) public batchState; // 0 Pending 1 Dispatched 2 Finalized 3 Canceled
    mapping(uint256 => mapping(address => euint64)) public deposits;

    constructor(IERC7984 token_) {
        token = token_;
    }

    // test helpers
    function setBatchState(uint256 batchId, uint8 state) external {
        batchState[batchId] = state;
    }

    function advanceBatch() external {
        currentBatchId++;
    }

    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata
    ) external returns (ebool) {
        require(msg.sender == address(token), "wrong token");
        require(batchState[currentBatchId] == 0, "not pending");
        euint64 prev = deposits[currentBatchId][from];
        deposits[currentBatchId][from] = euint64.unwrap(prev) == 0 ? amount : FHE.add(prev, amount);
        FHE.allowThis(deposits[currentBatchId][from]);
        FHE.makePubliclyDecryptable(deposits[currentBatchId][from]);
        ebool ok = FHE.asEbool(true);
        FHE.allowTransient(ok, msg.sender);
        return ok;
    }

    function quit(uint256 batchId) external returns (bytes32) {
        require(batchState[batchId] == 0 || batchState[batchId] == 3, "wrong state");
        euint64 amount = deposits[batchId][msg.sender];
        require(euint64.unwrap(amount) != 0, "no deposit");
        deposits[batchId][msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(deposits[batchId][msg.sender]);
        FHE.allowTransient(amount, address(token));
        token.confidentialTransfer(msg.sender, amount);
        return euint64.unwrap(amount);
    }
}
