import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

// Feasibility probe for Zama Confidential Vault (Sepolia): can an arbitrary
// address join a deposit batch and claim cShares? Verifies the whitelist gate
// does not block us and measures batch settlement latency.
//   npx hardhat run scripts/earn-probe.ts --network sepolia
const USDC = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF"; // Mock USDC (public mint)
const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639"; // same wrapper our cUSDC vault uses
const BATCHER = "0x56E3CF41D18e58AF476C05e9B1705ac2b13862C9";
const CSHARE = "0x7E93d5c150A2178B1fCde0278582Acf59478eA5f";
const AMOUNT = 25_000_000n; // 25 USDC

const erc20Abi = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const wrapperAbi = [
  "function wrap(address to, uint256 amount)",
  "function confidentialTransferAndCall(address to, bytes32 amount, bytes inputProof, bytes data) returns (bytes32)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
];
const batcherAbi = [
  "function currentBatchId() view returns (uint256)",
  "function batchState(uint256) view returns (uint8)",
  "function deposits(uint256 batchId, address account) view returns (bytes32)",
  "function claim(uint256 batchId, address account) returns (bytes32)",
];
const STATES = ["Pending", "Dispatched", "Finalized", "Canceled"];

async function main() {
  await fhevm.initializeCLIApi();
  const [me] = await ethers.getSigners();
  const usdc = new ethers.Contract(USDC, erc20Abi, me);
  const cusdc = new ethers.Contract(CUSDC, wrapperAbi, me);
  const batcher = new ethers.Contract(BATCHER, batcherAbi, me);
  console.log(`me ${me.address}`);

  console.log(`[1] mint + shield ${AMOUNT} USDC`);
  await (await usdc.mint(me.address, AMOUNT)).wait();
  await (await usdc.approve(CUSDC, AMOUNT)).wait();
  await (await cusdc.wrap(me.address, AMOUNT)).wait();

  const batchId = await batcher.currentBatchId();
  console.log(`[2] joining deposit batch #${batchId} (encrypted amount)`);
  const enc = await fhevm.createEncryptedInput(CUSDC, me.address).add64(AMOUNT).encrypt();
  const tx = await cusdc.confidentialTransferAndCall(BATCHER, enc.handles[0], enc.inputProof, "0x");
  const receipt = await tx.wait();
  console.log(`    joined, gas=${receipt.gasUsed} tx=${tx.hash}`);

  const handle = await batcher.deposits(batchId, me.address);
  console.log(`    deposits(#${batchId}, me) handle=${handle}`);
  if (handle === ethers.ZeroHash) throw new Error("zero deposit handle — join silently failed (gate?)");
  try {
    const amount = await fhevm.userDecryptEuint(FhevmType.euint64, handle, BATCHER, me);
    console.log(`    decrypted joined amount: ${amount}`);
  } catch (error) {
    console.log(`    (cannot user-decrypt deposit handle: ${(error as Error).message.slice(0, 80)})`);
  }

  console.log(`[3] polling batch #${batchId} state (up to 8 min)…`);
  for (let i = 0; i < 16; i++) {
    const state = Number(await batcher.batchState(batchId));
    console.log(`    ${new Date().toISOString()} batch #${batchId}: ${STATES[state]}`);
    if (state === 2) {
      console.log(`[4] finalized — claiming cShares`);
      await (await batcher.claim(batchId, me.address)).wait();
      const balHandle = await new ethers.Contract(CSHARE, wrapperAbi, me).confidentialBalanceOf(me.address);
      const shares = await fhevm.userDecryptEuint(FhevmType.euint64, balHandle, CSHARE, me);
      console.log(`✓ SUCCESS: claimed, cShare balance = ${shares}`);
      return;
    }
    if (state === 3) throw new Error("batch canceled — deposit refundable via quit()");
    await new Promise((r) => setTimeout(r, 30_000));
  }
  console.log(`    still not finalized — re-run later to claim: batch #${batchId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
