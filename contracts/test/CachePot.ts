import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { CachePot, CachePot__factory, TestERC7984, TestERC7984__factory } from "../types";

const PERIOD = 3600;
const OPERATOR_FOREVER = 2n ** 48n - 1n;

describe("CachePot", function () {
  let signers: HardhatEthersSigner[];
  let sponsor: HardhatEthersSigner;
  let pot: CachePot;
  let potAddress: string;
  let token: TestERC7984;
  let tokenAddress: string;

  before(async function () {
    signers = await ethers.getSigners();
    sponsor = signers[19];
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This suite only runs on the FHEVM mock environment");
      this.skip();
    }
    const tokenFactory = (await ethers.getContractFactory("TestERC7984")) as TestERC7984__factory;
    token = (await tokenFactory.deploy()) as TestERC7984;
    tokenAddress = await token.getAddress();
    const potFactory = (await ethers.getContractFactory("CachePot")) as CachePot__factory;
    pot = (await potFactory.deploy(tokenAddress, PERIOD)) as CachePot;
    potAddress = await pot.getAddress();
  });

  async function mintAndApprove(user: HardhatEthersSigner, amount: number) {
    await (await token.mint(user.address, amount)).wait();
    await (await token.connect(user).setOperator(potAddress, OPERATOR_FOREVER)).wait();
  }

  async function encFor(user: HardhatEthersSigner, amount: number) {
    return fhevm.createEncryptedInput(potAddress, user.address).add64(amount).encrypt();
  }

  async function deposit(user: HardhatEthersSigner, amount: number) {
    const enc = await encFor(user, amount);
    await (await pot.connect(user).deposit(enc.handles[0], enc.inputProof)).wait();
  }

  async function withdraw(user: HardhatEthersSigner, amount: number) {
    const enc = await encFor(user, amount);
    await (await pot.connect(user).withdraw(enc.handles[0], enc.inputProof)).wait();
  }

  async function fundPrize(amount: number) {
    await (await token.mint(sponsor.address, amount)).wait();
    await (await token.connect(sponsor).setOperator(potAddress, OPERATOR_FOREVER)).wait();
    const enc = await encFor(sponsor, amount);
    await (await pot.connect(sponsor).fundPrize(enc.handles[0], enc.inputProof)).wait();
  }

  async function ledgerBalance(user: HardhatEthersSigner): Promise<bigint> {
    return fhevm.userDecryptEuint(FhevmType.euint64, await pot.balanceOf(user.address), potAddress, user);
  }

  async function tokenBalance(user: HardhatEthersSigner): Promise<bigint> {
    return fhevm.userDecryptEuint(
      FhevmType.euint64,
      await token.confidentialBalanceOf(user.address),
      tokenAddress,
      user,
    );
  }

  async function wonLastRound(user: HardhatEthersSigner): Promise<boolean> {
    return fhevm.userDecryptEbool(await pot.winnerFlagOf(user.address), potAddress, user);
  }

  async function prizePotClear(): Promise<bigint> {
    return fhevm.publicDecryptEuint(FhevmType.euint64, await pot.prizePot());
  }

  async function closeAndDraw(batchSize: number) {
    await time.increase(PERIOD);
    await (await pot.closeRound()).wait();
    while ((await pot.state()) === 1n) {
      await (await pot.advanceDraw(batchSize)).wait();
    }
  }

  it("deposit pulls real tokens into the pot and credits the ledger", async function () {
    const [, alice] = signers;
    await mintAndApprove(alice, 1000);
    await deposit(alice, 400);

    expect(await ledgerBalance(alice)).to.eq(400n);
    expect(await tokenBalance(alice)).to.eq(600n);
  });

  it("withdraw returns tokens; over-withdrawal clamps to the ledger balance", async function () {
    const [, alice] = signers;
    await mintAndApprove(alice, 1000);
    await deposit(alice, 400);
    await withdraw(alice, 9999);

    expect(await ledgerBalance(alice)).to.eq(0n);
    expect(await tokenBalance(alice)).to.eq(1000n);
  });

  it("deposit beyond the token balance credits zero (transfer returns encrypted 0)", async function () {
    const [, alice] = signers;
    await mintAndApprove(alice, 100);
    await deposit(alice, 250);

    expect(await ledgerBalance(alice)).to.eq(0n);
    expect(await tokenBalance(alice)).to.eq(100n);
  });

  it("full no-loss cycle: deposit, win, withdraw principal plus prize in real tokens", async function () {
    const [, alice] = signers;
    await mintAndApprove(alice, 1000);
    await deposit(alice, 1000);
    await fundPrize(500);
    expect(await prizePotClear()).to.eq(500n);

    await closeAndDraw(10);

    expect(await wonLastRound(alice)).to.eq(true);
    expect(await ledgerBalance(alice)).to.eq(1500n);
    expect(await prizePotClear()).to.eq(0n);

    await withdraw(alice, 1500);
    expect(await tokenBalance(alice)).to.eq(1500n);
    expect(await pot.roundId()).to.eq(1n);
  });

  it("TWAB anti-snipe: depositing after the round closes earns zero weight", async function () {
    const [, alice, bob] = signers;
    await mintAndApprove(alice, 100);
    await mintAndApprove(bob, 100000);
    await deposit(alice, 100);
    await fundPrize(50);

    await time.increase(PERIOD);
    await (await pot.closeRound()).wait();
    // freeze removed: bob can deposit mid-draw, but his weight counts for the NEXT round
    await deposit(bob, 100000);
    while ((await pot.state()) === 1n) {
      await (await pot.advanceDraw(10)).wait();
    }

    expect(await wonLastRound(alice)).to.eq(true);
    expect(await wonLastRound(bob)).to.eq(false);
    expect(await ledgerBalance(alice)).to.eq(150n);
    expect(await ledgerBalance(bob)).to.eq(100000n);
  });

  it("TWAB historical weight: withdrawing mid-draw keeps the closed round's odds", async function () {
    const [, alice] = signers;
    await mintAndApprove(alice, 500);
    await deposit(alice, 500);
    await fundPrize(30);

    await time.increase(PERIOD);
    await (await pot.closeRound()).wait();
    await withdraw(alice, 500); // principal out mid-draw (accPrev two-segment path)
    expect(await tokenBalance(alice)).to.eq(500n);
    while ((await pot.state()) === 1n) {
      await (await pot.advanceDraw(10)).wait();
    }

    // weight is historical: alice still wins the closed round with zero live balance
    expect(await wonLastRound(alice)).to.eq(true);
    expect(await ledgerBalance(alice)).to.eq(30n);
  });

  it("exactly one winner among three; scan resumes across single-step batches", async function () {
    const users: [HardhatEthersSigner, number][] = [
      [signers[1], 100],
      [signers[2], 300],
      [signers[3], 600],
    ];
    for (const [user, amount] of users) {
      await mintAndApprove(user, amount);
      await deposit(user, amount);
    }
    await fundPrize(90);

    await closeAndDraw(1); // one participant per transaction: accumulator carry-over

    let winners = 0;
    let total = 0n;
    for (const [user, amount] of users) {
      const won = await wonLastRound(user);
      const bal = await ledgerBalance(user);
      expect(bal).to.eq(won ? BigInt(amount) + 90n : BigInt(amount));
      if (won) winners++;
      total += bal;
    }
    expect(winners).to.eq(1);
    expect(total).to.eq(1090n);
  });

  it("zero total weight: nobody wins and the prize rolls over to the next round", async function () {
    const [, alice] = signers;
    // alice registers but her deposit silently transfers 0 (no token balance)
    await (await token.connect(alice).setOperator(potAddress, OPERATOR_FOREVER)).wait();
    await deposit(alice, 100);
    expect(await ledgerBalance(alice)).to.eq(0n);
    await fundPrize(70);

    await closeAndDraw(10);

    expect(await wonLastRound(alice)).to.eq(false);
    expect(await ledgerBalance(alice)).to.eq(0n);
    expect(await prizePotClear()).to.eq(70n); // rolled over, not lost
    expect(await pot.state()).to.eq(0n);
  });

  it("state guards: prize funding and drawing-phase requirements", async function () {
    const [, alice] = signers;
    await mintAndApprove(alice, 100);
    await deposit(alice, 100);

    await time.increase(PERIOD);
    await expect(pot.closeRound()).to.be.revertedWith("no prize");

    await fundPrize(10);
    await (await pot.closeRound()).wait();
    await expect(pot.closeRound()).to.be.revertedWith("not open");

    const enc = await encFor(sponsor, 1);
    await expect(pot.connect(sponsor).fundPrize(enc.handles[0], enc.inputProof)).to.be.revertedWith("not open");
    await (await pot.advanceDraw(10)).wait();
    await expect(pot.advanceDraw(1)).to.be.revertedWith("not drawing");
  });

  it("HCU calibration: measures per-participant cost and derives BATCH_MAX", async function () {
    const GLOBAL_LIMIT = 20_000_000;
    const DEPTH_LIMIT = 5_000_000;
    const N = 16;

    for (let i = 0; i < N; i++) {
      await mintAndApprove(signers[i + 1], 100 * (i + 1));
      await deposit(signers[i + 1], 100 * (i + 1));
    }
    await fundPrize(1000);
    await time.increase(PERIOD);

    const closeReceipt = await (await pot.closeRound()).wait();
    const closeHcu = fhevm.computeTransactionHCU(closeReceipt!);
    console.log(`      closeRound        global=${closeHcu.globalHCU} depth=${closeHcu.maxHCUDepth}`);
    expect(closeHcu.globalHCU).to.be.lt(GLOBAL_LIMIT);
    expect(closeHcu.maxHCUDepth).to.be.lt(DEPTH_LIMIT);

    const batch = 8;
    const drawReceipt = await (await pot.advanceDraw(batch)).wait();
    const drawHcu = fhevm.computeTransactionHCU(drawReceipt!);
    const perGlobal = Math.ceil(drawHcu.globalHCU / batch);
    const perDepth = Math.ceil(drawHcu.maxHCUDepth / batch);
    const batchMax = Math.min(Math.floor(GLOBAL_LIMIT / perGlobal), Math.floor(DEPTH_LIMIT / perDepth));
    console.log(`      advanceDraw(${batch})    global=${drawHcu.globalHCU} depth=${drawHcu.maxHCUDepth}`);
    console.log(`      per participant   global≈${perGlobal} depth≈${perDepth}  →  BATCH_MAX=${batchMax}`);

    expect(drawHcu.globalHCU).to.be.lt(GLOBAL_LIMIT);
    expect(drawHcu.maxHCUDepth).to.be.lt(DEPTH_LIMIT);
    expect(batchMax).to.be.gte(4); // design floor

    await (await pot.advanceDraw(batch)).wait();
    expect(await pot.state()).to.eq(0n);

    let winners = 0;
    for (let i = 0; i < N; i++) if (await wonLastRound(signers[i + 1])) winners++;
    expect(winners).to.eq(1);
  });
});
