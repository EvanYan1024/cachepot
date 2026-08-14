import { deployments, ethers } from "hardhat";

// Cron-friendly single pass over the two-layer protocol: closes the pool round when
// due, scans every funded vault to completion in BATCH-sized transactions, and skips
// anything still pending past the grace period (junk registrations, empty vaults).
// Safe to run concurrently with users — every call is permissionless. Usage:
//   npx hardhat run scripts/keeper.ts --network sepolia
const BATCH = 6; // measured HCU ceiling is 7 per tx, see DESIGN.md §8
const VAULT_NAMES = ["CacheVault_cUSDT", "CacheVault_cUSDC", "CacheVault_cWETH"];

async function main() {
  const pool = await ethers.getContractAt("CachePrizePool", (await deployments.get("CachePrizePool")).address);
  const vaults = await Promise.all(
    VAULT_NAMES.map(async (name) => ethers.getContractAt("CacheVault", (await deployments.get(name)).address)),
  );

  const [state, openedAt, period, totalContribution] = await Promise.all([
    pool.state(),
    pool.openedAt(),
    pool.roundPeriod(),
    pool.totalContribution(),
  ]);
  const now = Math.floor(Date.now() / 1000);
  console.log(
    `state=${state} totalContribution=${totalContribution} closeable_in=${Number(openedAt + period) - now}s`,
  );

  if (state === 0n) {
    if (now < Number(openedAt + period)) return console.log("round not due yet");
    if (totalContribution === 0n) return console.log("no contributions, nothing to draw");
    console.log("closing round…");
    await (await pool.closeRound()).wait();
  }

  const roundId = await pool.roundId();
  for (const vault of vaults) {
    const address = await vault.getAddress();
    if ((await pool.contribution(address)) === 0n || (await pool.vaultDrawn(address))) continue;
    try {
      // a dangling scan from a skipped round restarts; a live one just advances
      if (!(await vault.drawing()) || (await vault.drawRound()) !== roundId) {
        console.log(`beginDraw ${address}…`);
        await (await vault.beginDraw()).wait();
      }
      while (await vault.drawing()) {
        console.log(`advanceDraw ${address} from ${await vault.cursor()}…`);
        await (await vault.advanceDraw(BATCH)).wait();
      }
    } catch (error) {
      // e.g. "no participants" on a funded-but-empty vault: leave it to the skip pass
      console.error(`vault ${address} failed, continuing:`, (error as Error).message);
    }
  }

  // anything still pending (junk registration, empty or broken vault) gets skipped
  // once the grace period is over, so one bad vault cannot stall the round
  if ((await pool.state()) === 1n) {
    const grace = await pool.DRAW_GRACE();
    const closedAt = await pool.closedAt();
    const block = await ethers.provider.getBlock("latest");
    if (BigInt(block!.timestamp) >= closedAt + grace) {
      const count = await pool.vaultCount();
      for (let i = 0n; i < count; i++) {
        const address = await pool.vaults(i);
        if ((await pool.contribution(address)) === 0n || (await pool.vaultDrawn(address))) continue;
        console.log(`skipVault ${address}…`);
        await (await pool.skipVault(address)).wait();
      }
    } else {
      console.log(`still drawing; grace ends in ${closedAt + grace - BigInt(block!.timestamp)}s`);
    }
  }
  console.log(`done: round ${await pool.roundId()} state=${await pool.state()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
