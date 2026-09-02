import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Zama's official confidential tokens on Sepolia. Each wrapper's underlying ERC-20
// has a public mint that doubles as the testnet faucet.
// https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia
const SEPOLIA_TOKENS = {
  cUSDT: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
  cUSDC: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
  cWETH: "0x46208622DA27d91db4f0393733C8BA082ed83158",
} as const;

// Zama Confidential Vault (Earn) on Sepolia — only cUSDC has an Earn market, so
// only that vault gets the wiring; the rest deploy with Earn disabled.
// https://docs.zama.org/protocol/confidential-vault/reference/addresses
// shareToken is read from the batchers' own toToken()/fromToken() — the docs page
// still lists the pre-rotation cShare, which the new batchers no longer pay out.
const SEPOLIA_EARN: Record<string, { shareToken: string; depositBatcher: string; redeemBatcher: string }> = {
  [SEPOLIA_TOKENS.cUSDC]: {
    shareToken: "0x13F7d34A4f0102734F19E3Ff16e068Fe194B28c4",
    depositBatcher: "0x48758559c14d4d92b4C74A99660B6a8dbe85F53b",
    redeemBatcher: "0xe94E9afdDd43a19C2914739e9279cb6Fe287BEb0",
  },
};

// PRIZE_TOKEN: the confidential asset every prize is paid in (must be an ERC7984
// ERC-20 wrapper, so contributions can be verified as plaintext).
// VAULT_TOKENS: comma-separated confidential assets to open vaults over.
// ROUND_PERIOD: draw period in seconds (default 600s for demo pacing).
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers } = hre;

  const prizeToken = process.env.PRIZE_TOKEN ?? SEPOLIA_TOKENS.cUSDT;
  const vaultTokens = (process.env.VAULT_TOKENS ?? Object.values(SEPOLIA_TOKENS).join(",")).split(",");
  const period = process.env.ROUND_PERIOD ?? "600";

  const pool = await deploy("CachePrizePool", { from: deployer, args: [prizeToken, period], log: true });
  const poolContract = await ethers.getContractAt("CachePrizePool", pool.address);

  console.log(`\nCachePrizePool: ${pool.address} (prize token ${prizeToken}, period ${period}s)`);

  for (const token of vaultTokens) {
    const symbol = Object.entries(SEPOLIA_TOKENS).find(([, a]) => a === token)?.[0] ?? token.slice(0, 8);
    const earn = hre.network.name === "sepolia" ? SEPOLIA_EARN[token] : undefined;
    const zero = ethers.ZeroAddress;
    const vault = await deploy(`CacheVault_${symbol}`, {
      contract: "CacheVault",
      from: deployer,
      args: [
        token,
        pool.address,
        earn?.shareToken ?? zero,
        earn?.depositBatcher ?? zero,
        earn?.redeemBatcher ?? zero,
        earn ? deployer : zero,
      ],
      log: true,
    });
    if (!(await poolContract.isVault(vault.address))) {
      await (await poolContract.registerVault(vault.address)).wait();
    }
    console.log(`  vault ${symbol.padEnd(6)} ${vault.address}  (asset ${token})`);
  }
};
export default func;
func.id = "deploy_cachepot_v8"; // v8: vault scan opens the next window empty, batch 6 -> 10
func.tags = ["CachePot"];
