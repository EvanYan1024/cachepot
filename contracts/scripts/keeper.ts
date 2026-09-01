import { deployments, ethers, fhevm } from "hardhat";

// Cron-friendly single pass over the two-layer protocol: closes the pool round when
// due, scans every funded vault to completion in BATCH-sized transactions, and skips
// anything still pending past the grace period (junk registrations, empty vaults).
// Safe to run concurrently with users — every call is permissionless. Usage:
//   npx hardhat run scripts/keeper.ts --network sepolia
const BATCH = 6; // measured HCU ceiling is 7 per tx
const VAULT_NAMES = ["CacheVault_cUSDT", "CacheVault_cUSDC", "CacheVault_cWETH"];
// Sepolia has no live rate market, so the keeper simulates the yield leg: mint mock
// USDT and push it through the same permissionless contribute() a production
// liquidator would call. ponytail: fixed drip per populated vault per round; swap for
// a real harvest (Zama Earn / Aave) when a yield source exists.
const YIELD_DRIP = 5_000_000n; // 5 USDT per populated vault per round
// A full drip+draw cycle is ~9 transactions, so the keeper only drives a draw
// every few hours regardless of the (much shorter) round period. Visitors are
// never throttled: the round sits funded and closeable, one click away in the app.
const CYCLE_THROTTLE = 4 * 3600;

async function main() {
  // the plugin hooks estimateGas even for plain transactions; without this an
  // underlying provider error gets masked by "plugin is not initialized"
  await fhevm.initializeCLIApi();
  const [signer] = await ethers.getSigners();
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

  /// Simulated yield leg: fund every populated vault that still has no odds this
  /// round, so an external sponsor funding one vault cannot starve the others.
  async function dripYield(): Promise<boolean> {
    const dry = [];
    for (const vault of vaults) {
      const address = await vault.getAddress();
      if ((await vault.participantCount()) > 0n && (await pool.contribution(address)) === 0n) dry.push(address);
    }
    if (dry.length === 0) return false;
    const underlying = new ethers.Contract(
      await pool.underlying(),
      [
        "function mint(address to, uint256 amount)",
        "function approve(address, uint256) returns (bool)",
        "function allowance(address, address) view returns (uint256)",
      ],
      signer,
    );
    const total = YIELD_DRIP * BigInt(dry.length);
    console.log(`simulating yield: contributing ${YIELD_DRIP} to each of ${dry.length} vault(s)`);
    await (await underlying.mint(signer.address, total)).wait();
    const poolAddress = await pool.getAddress();
    // USDT-style approve guard: a non-zero allowance (left dangling by a crashed
    // run) must be reset to zero before it can be set again
    if ((await underlying.allowance(signer.address, poolAddress)) > 0n) {
      await (await underlying.approve(poolAddress, 0)).wait();
    }
    await (await underlying.approve(poolAddress, total)).wait();
    for (const address of dry) {
      await (await pool.contribute(address, YIELD_DRIP)).wait();
    }
    return true;
  }

  // draw only when the round is due AND the keeper's own cadence allows it; either
  // way the pass continues to prefunding and Earn claims below
  const due = now >= Number(openedAt + period);
  const throttled = now - Number(openedAt) < CYCLE_THROTTLE;
  if (state === 0n && due && !throttled) {
    if (totalContribution === 0n) await dripYield(); // fallback: nobody prefunded it
    if ((await pool.totalContribution()) > 0n) {
      console.log("closing round…");
      await (await pool.closeRound()).wait();
    } else {
      console.log("no participants anywhere, nothing to draw");
    }
  } else if (state === 0n) {
    console.log(due ? `throttled; next keeper draw in ${CYCLE_THROTTLE - (now - Number(openedAt))}s` : "round not due yet");
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
  // Prefund the freshly opened round so the interface always shows a live prize and
  // real vault odds. Contributions are consumed by the draw, so a round funded only
  // at closing time would read as an empty pot for its entire life.
  if ((await pool.state()) === 0n && (await pool.totalContribution()) === 0n) {
    console.log("prefunding the next round…");
    await dripYield();
  }

  // claim any finalized Earn batches — deposit AND redeem — for wired vaults; the
  // claim is permissionless and lands the tokens directly in the vault. Claiming an
  // already-claimed batch SUCCEEDS on the real batcher (it transfers an encrypted
  // zero), so the Claimed event log is the only reliable dedup.
  const batcherAbi = [
    "function currentBatchId() view returns (uint256)",
    "function batchState(uint256) view returns (uint8)",
    "function deposits(uint256, address) view returns (bytes32)",
    "function claim(uint256, address)",
    "event Claimed(uint256 indexed batchId, address indexed account, bytes32 amount)",
  ];
  const BATCH_WINDOW = 24n; // ids to scan back from the current batch (~1 day)
  const LOOKBACK_BLOCKS = 45_000n; // ~1 week of Sepolia blocks; stays under RPC 50k getLogs range caps
  const latestBlock = BigInt(await ethers.provider.getBlockNumber());
  for (const vault of vaults) {
    let batchers: string[];
    try {
      batchers = [await vault.depositBatcher(), await vault.redeemBatcher()];
    } catch {
      continue; // pre-earn deployment without the getters
    }
    const address = await vault.getAddress();
    for (const batcherAddress of batchers) {
      if (batcherAddress === ethers.ZeroAddress) continue;
      const batcher = new ethers.Contract(batcherAddress, batcherAbi, signer);
      let claimed = new Set<bigint>();
      try {
        const logs = await batcher.queryFilter(
          batcher.filters.Claimed(null, address),
          Number(latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n),
        );
        claimed = new Set(logs.map((log) => (log as ethers.EventLog).args.batchId as bigint));
      } catch (error) {
        // RPC log-range limit: fall back to re-claiming, which only transfers zero
        console.warn(`claim-log scan failed on ${batcherAddress}:`, (error as Error).message.slice(0, 80));
      }
      const current: bigint = await batcher.currentBatchId();
      for (let id = current > BATCH_WINDOW ? current - BATCH_WINDOW : 0n; id <= current; id++) {
        if (claimed.has(id)) continue;
        if (Number(await batcher.batchState(id)) !== 2) continue;
        if ((await batcher.deposits(id, address)) === ethers.ZeroHash) continue;
        await (await batcher.claim(id, address)).wait();
        console.log(`claimed earn batch #${id} on ${batcherAddress} for vault ${address}`);
      }
    }
  }

  console.log(`done: round ${await pool.roundId()} state=${await pool.state()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
