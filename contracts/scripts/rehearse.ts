import { FhevmType } from "@fhevm/hardhat-plugin";
import { deployments, ethers, fhevm } from "hardhat";
import { CachePrizePool, CacheVault } from "../types";

// Full multi-vault round rehearsal against the live network and Zama's official
// confidential tokens: shield → deposit into two vaults → sponsor both → close →
// draw every funded vault → verify exactly one payout → claim.
//
// The sole depositor is present in BOTH funded vaults, so a broken single-payout
// guard would credit the prize twice. That is the assertion this run exists for.
const BATCH = 7; // measured HCU ceiling for the split architecture, see DESIGN.md §8

const VAULTS = [
  { name: "CacheVault_cUSDT", underlying: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0", deposit: 100_000_000n },
  { name: "CacheVault_cUSDC", underlying: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF", deposit: 50_000_000n },
];
const CONTRIBUTIONS = [20_000_000n, 10_000_000n]; // buys each vault its share of the odds

const erc20Abi = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const wrapperAbi = [
  "function wrap(address to, uint256 amount)",
  "function setOperator(address operator, uint48 until)",
  "function isOperator(address holder, address spender) view returns (bool)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
  "function underlying() view returns (address)",
];

async function main() {
  await fhevm.initializeCLIApi();
  const [me] = await ethers.getSigners();
  const poolAddress = (await deployments.get("CachePrizePool")).address;
  const pool = (await ethers.getContractAt("CachePrizePool", poolAddress)) as unknown as CachePrizePool;
  const prizeToken = await pool.prizeToken();
  const prizeUnderlying = new ethers.Contract(await pool.underlying(), erc20Abi, me);

  console.log(`pool  ${poolAddress}`);
  console.log(`prize ${prizeToken}`);
  console.log(`me    ${me.address}\n`);

  const vaults: { vault: CacheVault; address: string; token: ethers.Contract }[] = [];
  for (const spec of VAULTS) {
    const address = (await deployments.get(spec.name)).address;
    const vault = (await ethers.getContractAt("CacheVault", address)) as unknown as CacheVault;
    const token = new ethers.Contract(await vault.token(), wrapperAbi, me);
    const under = new ethers.Contract(spec.underlying, erc20Abi, me);

    console.log(`[1] ${spec.name}: faucet + shield ${spec.deposit}`);
    await (await under.mint(me.address, spec.deposit)).wait();
    await (await under.approve(await token.getAddress(), spec.deposit)).wait();
    await (await token.wrap(me.address, spec.deposit)).wait();
    if (!(await token.isOperator(me.address, address))) {
      await (await token.setOperator(address, 2n ** 48n - 1n)).wait();
    }

    console.log(`[2] ${spec.name}: depositing ${spec.deposit} (encrypted)`);
    const enc = await fhevm.createEncryptedInput(address, me.address).add64(spec.deposit).encrypt();
    await (await vault.deposit(enc.handles[0], enc.inputProof)).wait();

    vaults.push({ vault, address, token });
  }

  const totalContribution = CONTRIBUTIONS.reduce((a, b) => a + b, 0n);
  console.log(`\n[3] sponsoring the shared pool with ${totalContribution} (plaintext, verifiable)`);
  await (await prizeUnderlying.mint(me.address, totalContribution)).wait();
  await (await prizeUnderlying.approve(poolAddress, totalContribution)).wait();
  for (let i = 0; i < vaults.length; i++) {
    await (await pool.contribute(vaults[i].address, CONTRIBUTIONS[i])).wait();
    console.log(`    ${VAULTS[i].name} odds share: ${CONTRIBUTIONS[i]} / ${totalContribution}`);
  }

  const closeAt = (await pool.openedAt()) + (await pool.roundPeriod());
  for (;;) {
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    if (now >= closeAt) break;
    console.log(`    waiting ${closeAt - now}s for the round to close…`);
    await new Promise((r) => setTimeout(r, Number(closeAt - now) * 1000 + 5000));
  }

  const reserveBefore = await fhevm.publicDecryptEuint(FhevmType.euint64, await pool.reserve());
  const prizeBefore = await prizeBalance(pool, poolAddress, me.address);
  console.log(`\n    reserve before draw: ${reserveBefore}, my prize balance: ${prizeBefore}`);

  console.log(`[4] closing round ${await pool.roundId()} — encrypted vault target committed`);
  await (await pool.closeRound()).wait();
  console.log(`    funded vaults to scan: ${await pool.vaultsPending()}`);

  for (const { vault, address } of vaults) {
    if ((await pool.contribution(address)) === 0n) {
      console.log(`    skipping unfunded vault ${address}`);
      continue;
    }
    console.log(`[5] scanning vault ${address}`);
    await (await vault.beginDraw()).wait();
    while (await vault.drawing()) {
      console.log(`    advancing from cursor ${await vault.cursor()}/${await vault.participantCount()}`);
      await (await vault.advanceDraw(BATCH)).wait();
    }
  }

  console.log(`[6] round ${await pool.roundId()} settled, pool state ${await pool.state()}`);
  const reserveAfter = await fhevm.publicDecryptEuint(FhevmType.euint64, await pool.reserve());
  const prizeAfter = await prizeBalance(pool, poolAddress, me.address);
  const won = await fhevm.userDecryptEbool(await pool.wonLastRound(me.address), poolAddress, me);
  console.log(`    reserve after:  ${reserveAfter}`);
  console.log(`    prize balance:  ${prizeBefore} → ${prizeAfter}`);
  console.log(`    won last round: ${won}`);

  const credited = prizeAfter - prizeBefore;
  if (credited !== reserveBefore || reserveAfter !== 0n || !won) {
    throw new Error(
      `rehearsal failed: credited ${credited} (want ${reserveBefore}), reserve ${reserveAfter} (want 0), won ${won}`,
    );
  }
  console.log(`\n✓ present in BOTH funded vaults, paid exactly once: ${credited}`);

  const walletBefore = await confidentialBalance(prizeToken, me);
  console.log(`[7] claiming the prize as real ${prizeToken} tokens`);
  await (await pool.claim()).wait();
  const walletAfter = await confidentialBalance(prizeToken, me);
  const claimedLeft = await prizeBalance(pool, poolAddress, me.address);

  if (walletAfter !== walletBefore + prizeAfter || claimedLeft !== 0n) {
    throw new Error(`claim failed: wallet ${walletBefore} → ${walletAfter}, remaining ${claimedLeft}`);
  }
  console.log(`✓ claim settled: wallet ${walletBefore} → ${walletAfter}, prize balance now ${claimedLeft}`);
}

async function prizeBalance(pool: CachePrizePool, poolAddress: string, user: string): Promise<bigint> {
  const handle = await pool.prizeBalanceOf(user);
  if (handle === ethers.ZeroHash) return 0n;
  const [signer] = await ethers.getSigners();
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, signer);
}

async function confidentialBalance(token: string, signer: ethers.Signer): Promise<bigint> {
  const contract = new ethers.Contract(token, wrapperAbi, signer);
  const handle = await contract.confidentialBalanceOf(await signer.getAddress());
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, token, signer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
