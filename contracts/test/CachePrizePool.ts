import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { CachePrizePool, CacheVault, MaliciousVault, TestERC20, TestWrapper } from "../types";

const PERIOD = 3600;
const OPERATOR_FOREVER = 2n ** 48n - 1n;

describe("CachePrizePool", function () {
  let signers: HardhatEthersSigner[];
  let sponsor: HardhatEthersSigner;
  let pool: CachePrizePool;
  let poolAddress: string;
  let usdt: TestERC20;
  let cusdt: TestWrapper;
  let cusdtAddress: string;

  before(async function () {
    signers = await ethers.getSigners();
    sponsor = signers[19];
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This suite only runs on the FHEVM mock environment");
      this.skip();
    }
    usdt = (await (await ethers.getContractFactory("TestERC20")).deploy("Tether", "USDT", 6)) as TestERC20;
    cusdt = (await (
      await ethers.getContractFactory("TestWrapper")
    ).deploy(await usdt.getAddress(), "Confidential USDT", "cUSDT")) as TestWrapper;
    cusdtAddress = await cusdt.getAddress();
    pool = (await (
      await ethers.getContractFactory("CachePrizePool")
    ).deploy(cusdtAddress, PERIOD)) as CachePrizePool;
    poolAddress = await pool.getAddress();
  });

  /// Deploys a vault over a fresh confidential asset and registers it with the pool.
  async function newVault(symbol: string): Promise<{ vault: CacheVault; address: string; token: TestWrapper }> {
    const under = (await (await ethers.getContractFactory("TestERC20")).deploy(symbol, symbol, 6)) as TestERC20;
    const token = (await (
      await ethers.getContractFactory("TestWrapper")
    ).deploy(await under.getAddress(), `c${symbol}`, `c${symbol}`)) as TestWrapper;
    const vault = (await (
      await ethers.getContractFactory("CacheVault")
    ).deploy(await token.getAddress(), poolAddress)) as CacheVault;
    const address = await vault.getAddress();
    await (await pool.registerVault(address)).wait();
    // fund every signer we use in tests with the vault's underlying asset
    for (const s of signers.slice(0, 4)) {
      await (await under.mint(s.address, 10_000_000)).wait();
      await (await under.connect(s).approve(await token.getAddress(), 10_000_000)).wait();
      await (await token.connect(s).wrap(s.address, 10_000_000)).wait();
      await (await token.connect(s).setOperator(address, OPERATOR_FOREVER)).wait();
    }
    return { vault, address, token };
  }

  async function deposit(vault: CacheVault, address: string, user: HardhatEthersSigner, amount: number) {
    const enc = await fhevm.createEncryptedInput(address, user.address).add64(amount).encrypt();
    await (await vault.connect(user).deposit(enc.handles[0], enc.inputProof)).wait();
  }

  async function withdraw(vault: CacheVault, address: string, user: HardhatEthersSigner, amount: number) {
    const enc = await fhevm.createEncryptedInput(address, user.address).add64(amount).encrypt();
    await (await vault.connect(user).withdraw(enc.handles[0], enc.inputProof)).wait();
  }

  async function contribute(vaultAddress: string, amount: number) {
    await (await usdt.mint(sponsor.address, amount)).wait();
    await (await usdt.connect(sponsor).approve(poolAddress, amount)).wait();
    await (await pool.connect(sponsor).contribute(vaultAddress, amount)).wait();
  }

  async function reserve(): Promise<bigint> {
    return fhevm.publicDecryptEuint(FhevmType.euint64, await pool.reserve());
  }

  async function prizeBalance(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await pool.prizeBalanceOf(user.address);
    if (handle === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, user);
  }

  async function wonLastRound(user: HardhatEthersSigner): Promise<boolean> {
    const handle = await pool.wonLastRound(user.address);
    if (handle === ethers.ZeroHash) return false;
    return fhevm.userDecryptEbool(handle, poolAddress, user);
  }

  /// Closes the pool round and scans every funded vault to completion.
  async function drawAll(vaults: CacheVault[]) {
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    for (const v of vaults) {
      if (!(await pool.contribution(await v.getAddress()))) continue;
      await (await v.beginDraw()).wait();
      while (await v.drawing()) {
        await (await v.advanceDraw(10)).wait();
      }
    }
  }

  it("contribution is verified plaintext: the reserve tracks wrapped units exactly", async function () {
    const a = await newVault("AAA");
    await contribute(a.address, 500);
    expect(await pool.contribution(a.address)).to.eq(500n);
    expect(await pool.totalContribution()).to.eq(500n);
    expect(await reserve()).to.eq(500n);
  });

  it("single funded vault: its local winner takes the whole reserve as prize tokens", async function () {
    const [, alice] = signers;
    const a = await newVault("AAA");
    await deposit(a.vault, a.address, alice, 1000);
    await contribute(a.address, 500);

    await drawAll([a.vault]);

    expect(await wonLastRound(alice)).to.eq(true);
    expect(await prizeBalance(alice)).to.eq(500n);
    expect(await reserve()).to.eq(0n);
    expect(await pool.roundId()).to.eq(1n);
    // principal stays in the vault, denominated in the vault's own asset
    expect(
      await fhevm.userDecryptEuint(FhevmType.euint64, await a.vault.balanceOf(alice.address), a.address, alice),
    ).to.eq(1000n);
  });

  it("prize is claimable as real prize tokens and leaves the balance empty", async function () {
    const [, alice] = signers;
    const a = await newVault("AAA");
    await deposit(a.vault, a.address, alice, 1000);
    await contribute(a.address, 500);
    await drawAll([a.vault]);

    await (await pool.connect(alice).claim()).wait();
    expect(await prizeBalance(alice)).to.eq(0n);
    expect(
      await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await cusdt.confidentialBalanceOf(alice.address),
        cusdtAddress,
        alice,
      ),
    ).to.eq(500n);
  });

  it("a vault with no contribution has no odds and is skipped entirely", async function () {
    const [, alice, bob] = signers;
    const a = await newVault("AAA");
    const b = await newVault("BBB");
    await deposit(a.vault, a.address, alice, 1000);
    await deposit(b.vault, b.address, bob, 1_000_000); // far richer, but unfunded vault
    await contribute(a.address, 500);

    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    expect(await pool.vaultsPending()).to.eq(1n);
    await expect(b.vault.beginDraw()).to.be.revertedWith("no odds this round");

    await (await a.vault.beginDraw()).wait();
    while (await a.vault.drawing()) await (await a.vault.advanceDraw(10)).wait();

    expect(await prizeBalance(alice)).to.eq(500n);
    expect(await prizeBalance(bob)).to.eq(0n);
  });

  it("two funded vaults: exactly one depositor across the whole protocol is paid", async function () {
    const [, alice, bob] = signers;
    const a = await newVault("AAA");
    const b = await newVault("BBB");
    await deposit(a.vault, a.address, alice, 1000);
    await deposit(b.vault, b.address, bob, 1000);
    await contribute(a.address, 300);
    await contribute(b.address, 200);

    await drawAll([a.vault, b.vault]);

    const paid = (await prizeBalance(alice)) + (await prizeBalance(bob));
    expect(paid).to.eq(500n); // the full reserve, once
    expect(await reserve()).to.eq(0n);
    // and exactly one of them holds it
    expect([await prizeBalance(alice), await prizeBalance(bob)]).to.include(500n);
    expect(await wonLastRound(alice)).to.eq(!(await wonLastRound(bob)));
  });

  it("malicious vault flagging every depositor still cannot pay more than one prize", async function () {
    const [, alice, bob, carol] = signers;
    const evil = (await (
      await ethers.getContractFactory("MaliciousVault")
    ).deploy(poolAddress)) as MaliciousVault;
    const evilAddress = await evil.getAddress();
    await (await pool.registerVault(evilAddress)).wait();
    await contribute(evilAddress, 500); // sole funded vault, so vaultHit is certain

    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    await (await evil.drain([alice.address, bob.address, carol.address])).wait();

    const total = (await prizeBalance(alice)) + (await prizeBalance(bob)) + (await prizeBalance(carol));
    expect(total).to.eq(500n); // not 1500 — the encrypted single-payout guard holds
    expect(await reserve()).to.eq(0n);
  });

  it("TWAB anti-snipe survives the split: a late deposit earns no weight this round", async function () {
    const [, alice, bob] = signers;
    const a = await newVault("AAA");
    await deposit(a.vault, a.address, alice, 100);
    await contribute(a.address, 500);

    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    await deposit(a.vault, a.address, bob, 5_000_000); // whale arrives after the close
    await (await a.vault.beginDraw()).wait();
    while (await a.vault.drawing()) await (await a.vault.advanceDraw(10)).wait();

    expect(await prizeBalance(alice)).to.eq(500n);
    expect(await prizeBalance(bob)).to.eq(0n);
  });

  it("zero weight in the winning vault: the prize rolls over intact", async function () {
    const [, alice] = signers;
    const a = await newVault("AAA");
    await contribute(a.address, 500);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    // alice only arrives after the close, so the closed window carries no weight at all
    await deposit(a.vault, a.address, alice, 1000);
    await (await a.vault.beginDraw()).wait();
    while (await a.vault.drawing()) await (await a.vault.advanceDraw(10)).wait();

    expect(await prizeBalance(alice)).to.eq(0n);
    expect(await reserve()).to.eq(500n); // untouched, funds the next round
    expect(await pool.roundId()).to.eq(1n);
  });

  it("junk vault registration cannot stall the round: skipVault settles it after the grace", async function () {
    const evilEoa = signers[18];
    await (await pool.registerVault(evilEoa.address)).wait();
    await contribute(evilEoa.address, 500); // sole funded "vault": its interval is certain to win
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    // the EOA can even begin its draw and then go silent — still skippable
    await (await pool.connect(evilEoa).beginVaultDraw()).wait();

    await expect(pool.skipVault(evilEoa.address)).to.be.revertedWith("grace not over");
    await time.increase(await pool.DRAW_GRACE());
    await (await pool.skipVault(evilEoa.address)).wait();

    expect(await pool.state()).to.eq(0n); // Open again
    expect(await pool.roundId()).to.eq(1n);
    expect(await reserve()).to.eq(500n); // winning interval skipped: prize rolls over intact
  });

  it("skipVault only unblocks: the honest vault's scan and payout are untouched", async function () {
    const [, alice] = signers;
    const a = await newVault("AAA");
    const evilEoa = signers[18];
    await (await pool.registerVault(evilEoa.address)).wait();
    await deposit(a.vault, a.address, alice, 1000);
    await contribute(a.address, 300);
    await contribute(evilEoa.address, 200);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    await (await a.vault.beginDraw()).wait();
    while (await a.vault.drawing()) await (await a.vault.advanceDraw(10)).wait();
    expect(await pool.vaultsPending()).to.eq(1n); // the EOA still blocks settlement

    await time.increase(await pool.DRAW_GRACE());
    await (await pool.skipVault(evilEoa.address)).wait();
    expect(await pool.state()).to.eq(0n);
    // alice is paid iff vault A's interval won; either way the reserve is conserved
    const paid = await prizeBalance(alice);
    expect([0n, 500n]).to.include(paid);
    expect(paid + (await reserve())).to.eq(500n);
  });

  it("a vault skipped mid-scan cannot replay stale winner flags into a later round", async function () {
    const [, alice, bob] = signers;
    const evil = (await (
      await ethers.getContractFactory("MaliciousVault")
    ).deploy(poolAddress)) as MaliciousVault;
    const evilAddress = await evil.getAddress();
    await (await pool.registerVault(evilAddress)).wait();
    await contribute(evilAddress, 500);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    await (await evil.begin()).wait(); // begins round 0, then never credits or finishes
    await time.increase(await pool.DRAW_GRACE());
    await (await pool.skipVault(evilAddress)).wait(); // round 0 settles, prize rolls over

    // round 1: an honest vault is funded; the stale vault bought no odds this round
    const a = await newVault("AAA");
    await deposit(a.vault, a.address, alice, 1000);
    await contribute(a.address, 100);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    await expect(evil.credit([bob.address])).to.be.revertedWith("not begun this round");
  });

  it("a real vault skipped mid-scan restarts cleanly the next round", async function () {
    const [, alice] = signers;
    const a = await newVault("AAA");
    await deposit(a.vault, a.address, alice, 1000);
    await contribute(a.address, 500);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    await (await a.vault.beginDraw()).wait(); // begins, then nobody advances the scan
    await time.increase(await pool.DRAW_GRACE());
    await (await pool.skipVault(a.address)).wait();
    expect(await pool.state()).to.eq(0n);
    expect(await a.vault.drawing()).to.eq(true); // scan left dangling

    await contribute(a.address, 100); // reserve now 500 rolled over + 100
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    // a deposit landing between this close and the restart must settle against the
    // pending close boundary even though the dangling scan still has drawing == true
    await deposit(a.vault, a.address, alice, 500);
    await (await a.vault.beginDraw()).wait(); // restart despite the dangling scan
    while (await a.vault.drawing()) await (await a.vault.advanceDraw(10)).wait();

    expect(await prizeBalance(alice)).to.eq(600n); // sole depositor of the sole funded vault
    expect(await reserve()).to.eq(0n);
  });

  it("partial scan then skip: stale weight cannot poison the next round's draw", async function () {
    const [, alice, bob, carol] = signers;
    const a = await newVault("AAA");

    // round 0: alice and bob hold briefly and exit before the close; carol holds on.
    // bob's stint is huge, so any stale carry-over would dwarf round 1's real weight
    await deposit(a.vault, a.address, alice, 100);
    await deposit(a.vault, a.address, bob, 5_000_000);
    await withdraw(a.vault, a.address, alice, 100);
    await withdraw(a.vault, a.address, bob, 5_000_000);
    await deposit(a.vault, a.address, carol, 100);
    await contribute(a.address, 500);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    await (await a.vault.beginDraw()).wait();
    await (await a.vault.advanceDraw(1)).wait(); // visits alice only; bob and carol stranded
    await time.increase(await pool.DRAW_GRACE());
    await (await pool.skipVault(a.address)).wait();

    // round 1: carol is the only holder, so she must win with certainty
    await contribute(a.address, 100);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    await (await a.vault.beginDraw()).wait();
    while (await a.vault.drawing()) await (await a.vault.advanceDraw(10)).wait();

    expect(await prizeBalance(carol)).to.eq(600n); // 500 rolled over + 100
    expect(await prizeBalance(bob)).to.eq(0n); // stale round-0 weight was discarded
    expect(await reserve()).to.eq(0n);
  });

  it("finishVaultDraw requires beginVaultDraw in the same round", async function () {
    const evil = (await (
      await ethers.getContractFactory("MaliciousVault")
    ).deploy(poolAddress)) as MaliciousVault;
    const evilAddress = await evil.getAddress();
    await (await pool.registerVault(evilAddress)).wait();
    await contribute(evilAddress, 500);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();

    await expect(evil.finish()).to.be.revertedWith("not begun this round");
  });

  it("HCU calibration: per-participant cost of the split architecture", async function () {
    const a = await newVault("AAA");
    for (const s of signers.slice(1, 4)) await deposit(a.vault, a.address, s, 1000);
    await contribute(a.address, 500);
    await time.increase(PERIOD);
    await (await pool.closeRound()).wait();
    await (await a.vault.beginDraw()).wait();

    const one = fhevm.computeTransactionHCU((await (await a.vault.advanceDraw(1)).wait())!);
    const two = fhevm.computeTransactionHCU((await (await a.vault.advanceDraw(2)).wait())!);
    const perParticipant = two.globalHCU - one.globalHCU;
    console.log(`      advanceDraw(1)  global=${one.globalHCU} depth=${one.maxHCUDepth}`);
    console.log(`      advanceDraw(2)  global=${two.globalHCU} depth=${two.maxHCUDepth}`);
    console.log(`      per participant global≈${perParticipant}  →  BATCH_MAX=${Math.floor(20_000_000 / perParticipant)}`);
    expect(two.globalHCU).to.be.lt(20_000_000);
    expect(two.maxHCUDepth).to.be.lt(5_000_000);
  });
});
