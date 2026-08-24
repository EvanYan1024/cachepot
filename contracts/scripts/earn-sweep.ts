import { deployments, ethers } from "hardhat";

// Strategist op: push part of the cUSDC vault's idle balance into the Zama Earn
// deposit batcher. Claiming the resulting cShares back is permissionless and the
// keeper does it automatically. AMOUNT is in confidential units (6 decimals).
//   npx hardhat run scripts/earn-sweep.ts --network sepolia
const AMOUNT = 20_000_000n; // 20 cUSDC

async function main() {
  const vault = await ethers.getContractAt("CacheVault", (await deployments.get("CacheVault_cUSDC")).address);
  const batcher = new ethers.Contract(
    await vault.depositBatcher(),
    ["function currentBatchId() view returns (uint256)", "function deposits(uint256, address) view returns (bytes32)"],
    ethers.provider,
  );
  const batchId = await batcher.currentBatchId();
  console.log(`sweeping ${AMOUNT} into earn batch #${batchId}…`);
  await (await vault.sweepToEarn(AMOUNT)).wait();
  console.log(`deposit handle: ${await batcher.deposits(batchId, await vault.getAddress())}`);
  console.log(`batch settles after its min age; the keeper will claim the cShares`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
