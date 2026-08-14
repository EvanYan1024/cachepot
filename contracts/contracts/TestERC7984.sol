// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @dev Test-only confidential token with an open mint faucet. On Sepolia CachePot
/// targets the real cUSDT wrapper instead.
contract TestERC7984 is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("Test Confidential USDT", "tcUSDT", "") {}

    function mint(address to, uint64 amount) external {
        _mint(to, FHE.asEuint64(amount));
    }
}
