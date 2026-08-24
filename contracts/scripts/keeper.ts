import { deployments, ethers } from "hardhat";

// Cron-friendly single pass over the two-layer protocol: closes the pool round when
// due, scans every funded vault to completion in BATCH-sized transactions, and skips
// anything still pending past the grace period (junk registrations, empty vaults).
// Safe to run concurrently with users — every call is permissionless. Usage:
//   npx hardhat run scripts/keeper.ts --network sepolia
const BATCH = 6; // measured HCU ceiling is 7 per tx, see DESIGN.md §8
const VAULT_NAMES = ["CacheVault_cUSDT", "CacheVault_cUSDC", "CacheVault_cWETH"];
// Sepolia has no live rate market, so the keeper simulates the yield leg: mint mock
// USDT and push it through the same permissionless contribute() a production
// liquidator would call. ponytail: fixed drip per populated vault per round; swap for
// a real harvest (Zama Earn / Aave) when a yield source exists.
const YIELD_DRIP = 5_000_000n; // 5 USDT per populated vault per round

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
    if (totalContribution === 0n) {
      const populated = [];
      for (const vault of vaults) {
        if ((await vault.participantCount()) > 0n) populated.push(await vault.getAddress());
      }
      if (populated.length === 0) return console.log("no participants anywhere, nothing to draw");
      const [signer] = await ethers.getSigners();
      const underlying = new ethers.Contract(
        await pool.underlying(),
        ["function mint(address to, uint256 amount)", "function approve(address, uint256) returns (bool)"],
        signer,
      );
      const total = YIELD_DRIP * BigInt(populated.length);
      console.log(`simulating yield: contributing ${YIELD_DRIP} to each of ${populated.length} vault(s)`);
      await (await underlying.mint(signer.address, total)).wait();
      await (await underlying.approve(await pool.getAddress(), total)).wait();
      for (const address of populated) {
        await (await pool.contribute(address, YIELD_DRIP)).wait();
      }
    }
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
