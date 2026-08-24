import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

// Second half of the earn probe: push batch 2253 through dispatch → finalize,
// then claim our cShares and decrypt the balance. Everything is permissionless.
//   npx hardhat run scripts/earn-claim.ts --network sepolia
const BATCHER = "0x56E3CF41D18e58AF476C05e9B1705ac2b13862C9";
const CSHARE = "0x7E93d5c150A2178B1fCde0278582Acf59478eA5f";
const BATCH_ID = 2253n;

const batcherAbi = [
  "function batchState(uint256) view returns (uint8)",
  "function batchMinBatchAge(uint256) view returns (uint256)",
  "function batchCreatedAt(uint256) view returns (uint256)",
  "function dispatchBatch()",
  "function claim(uint256 batchId, address account) returns (bytes32)",
];
const wrapperAbi = ["function confidentialBalanceOf(address) view returns (bytes32)"];
const STATES = ["Pending", "Dispatched", "Finalized", "Canceled"];

async function main() {
  await fhevm.initializeCLIApi();
  const [me] = await ethers.getSigners();
  const batcher = new ethers.Contract(BATCHER, batcherAbi, me);
  const dispatchAt = (await batcher.batchCreatedAt(BATCH_ID)) + (await batcher.batchMinBatchAge(BATCH_ID));

  for (let i = 0; i < 45; i++) {
    const state = Number(await batcher.batchState(BATCH_ID));
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    console.log(`${new Date().toISOString()} batch #${BATCH_ID}: ${STATES[state]} (dispatchable in ${dispatchAt - now}s)`);

    if (state === 0 && now >= dispatchAt) {
      try {
        console.log("  dispatching…");
        await (await batcher.dispatchBatch()).wait();
      } catch (error) {
        console.log(`  dispatch failed (operator may have raced us): ${(error as Error).message.slice(0, 100)}`);
      }
    } else if (state === 2) {
      console.log("  finalized — claiming");
      await (await batcher.claim(BATCH_ID, me.address)).wait();
      const handle = await new ethers.Contract(CSHARE, wrapperAbi, me).confidentialBalanceOf(me.address);
      const shares = await fhevm.userDecryptEuint(FhevmType.euint64, handle, CSHARE, me);
      console.log(`✓ SUCCESS: cShare balance = ${shares}`);
      return;
    } else if (state === 3) {
      throw new Error("batch canceled — use quit() to refund");
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error("timed out after 45 min");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
