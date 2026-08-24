// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// Stand-in for a Zama Confidential Vault batcher: accepts confidential transfers,
/// tracks a publicly-decryptable pending amount per depositor, refunds on quit.
contract MockBatcher is ZamaEthereumConfig {
    IERC7984 public immutable token;
    mapping(address => euint64) public pending;

    constructor(IERC7984 token_) {
        token = token_;
    }

    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata
    ) external returns (ebool) {
        require(msg.sender == address(token), "wrong token");
        euint64 prev = pending[from];
        pending[from] = euint64.unwrap(prev) == 0 ? amount : FHE.add(prev, amount);
        FHE.allowThis(pending[from]);
        FHE.makePubliclyDecryptable(pending[from]);
        ebool ok = FHE.asEbool(true);
        FHE.allowTransient(ok, msg.sender);
        return ok;
    }

    function quit(uint256) external returns (bytes32) {
        euint64 amount = pending[msg.sender];
        pending[msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(pending[msg.sender]);
        FHE.allowTransient(amount, address(token));
        token.confidentialTransfer(msg.sender, amount);
        return euint64.unwrap(amount);
    }
}
