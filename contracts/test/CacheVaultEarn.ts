import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { CachePrizePool, CacheVault, MockBatcher, TestERC20, TestWrapper } from "../types";

const OPERATOR_FOREVER = 2n ** 48n - 1n;

describe("CacheVault Earn integration", function () {
  let signers: HardhatEthersSigner[];
  let strategist: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let pool: CachePrizePool;
  let vault: CacheVault;
  let vaultAddress: string;
  let token: TestWrapper;
  let tokenAddress: string;
  let shareToken: TestWrapper;
  let shareUnder: TestERC20;
  let depositBatcher: MockBatcher;
  let redeemBatcher: MockBatcher;

  before(async function () {
    signers = await ethers.getSigners();
    strategist = signers[0];
    user = signers[1];
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This suite only runs on the FHEVM mock environment");
      this.skip();
    }
    const under = (await (await ethers.getContractFactory("TestERC20")).deploy("USD Coin", "USDC", 6)) as TestERC20;
    token = (await (
      await ethers.getContractFactory("TestWrapper")
    ).deploy(await under.getAddress(), "Confidential USDC", "cUSDC")) as TestWrapper;
    tokenAddress = await token.getAddress();
    shareUnder = (await (await ethers.getContractFactory("TestERC20")).deploy("Vault Share", "mvUSDC", 6)) as TestERC20;
    shareToken = (await (
      await ethers.getContractFactory("TestWrapper")
    ).deploy(await shareUnder.getAddress(), "Confidential mvUSDC", "cShare")) as TestWrapper;

    depositBatcher = (await (await ethers.getContractFactory("MockBatcher")).deploy(tokenAddress)) as MockBatcher;
    redeemBatcher = (await (
      await ethers.getContractFactory("MockBatcher")
    ).deploy(await shareToken.getAddress())) as MockBatcher;

    pool = (await (await ethers.getContractFactory("CachePrizePool")).deploy(tokenAddress, 3600)) as CachePrizePool;
    vault = (await (
      await ethers.getContractFactory("CacheVault")
    ).deploy(
      tokenAddress,
      await pool.getAddress(),
      await shareToken.getAddress(),
      await depositBatcher.getAddress(),
      await redeemBatcher.getAddress(),
      strategist.address,
    )) as CacheVault;
    vaultAddress = await vault.getAddress();
    await (await pool.registerVault(vaultAddress)).wait();

    await (await under.mint(user.address, 10_000_000)).wait();
    await (await under.connect(user).approve(tokenAddress, 10_000_000)).wait();
    await (await token.connect(user).wrap(user.address, 10_000_000)).wait();
    await (await token.connect(user).setOperator(vaultAddress, OPERATOR_FOREVER)).wait();
  });

  async function deposit(amount: number) {
    const enc = await fhevm.createEncryptedInput(vaultAddress, user.address).add64(amount).encrypt();
    await (await vault.connect(user).deposit(enc.handles[0], enc.inputProof)).wait();
  }

  async function withdraw(amount: number) {
    const enc = await fhevm.createEncryptedInput(vaultAddress, user.address).add64(amount).encrypt();
    await (await vault.connect(user).withdraw(enc.handles[0], enc.inputProof)).wait();
  }

  async function walletBalance(): Promise<bigint> {
    const handle = await token.confidentialBalanceOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, user);
  }

  async function ledgerBalance(): Promise<bigint> {
    return fhevm.userDecryptEuint(FhevmType.euint64, await vault.balanceOf(user.address), vaultAddress, user);
  }

  async function pendingAt(batcher: MockBatcher): Promise<bigint> {
    const handle = await batcher.pending(vaultAddress);
    if (handle === ethers.ZeroHash) return 0n;
    return fhevm.publicDecryptEuint(FhevmType.euint64, handle);
  }

  it("withdraw pays out only what the buffer holds after a sweep", async function () {
    await deposit(100_000);
    await (await vault.connect(strategist).sweepToEarn(60_000)).wait();
    expect(await pendingAt(depositBatcher)).to.equal(60_000n);

    // buffer holds 40k; a 100k withdrawal must pay 40k and burn exactly 40k of ledger
    await withdraw(100_000);
    expect(await walletBalance()).to.equal(9_940_000n);
    expect(await ledgerBalance()).to.equal(60_000n);
  });

  it("sweep clamps to the vault's actual balance", async function () {
    await deposit(100_000);
    await (await vault.connect(strategist).sweepToEarn(500_000)).wait();
    expect(await pendingAt(depositBatcher)).to.equal(100_000n);
  });

  it("quitEarn recovers a canceled batch and withdrawals resume in full", async function () {
    await deposit(100_000);
    await (await vault.connect(strategist).sweepToEarn(100_000)).wait();
    await (await vault.connect(signers[2]).quitEarn(await depositBatcher.getAddress(), 1)).wait();
    await withdraw(100_000);
    expect(await walletBalance()).to.equal(10_000_000n);
    expect(await ledgerBalance()).to.equal(0n);
  });

  it("redeemFromEarn moves cShares to the redeem batcher, clamped to holdings", async function () {
    // hand the vault 50k cShares, standing in for a claimed deposit batch
    await (await shareUnder.mint(user.address, 50_000)).wait();
    await (await shareUnder.connect(user).approve(await shareToken.getAddress(), 50_000)).wait();
    await (await shareToken.connect(user).wrap(vaultAddress, 50_000)).wait();

    await (await vault.connect(strategist).redeemFromEarn(80_000)).wait();
    expect(await pendingAt(redeemBatcher)).to.equal(50_000n);
  });

  it("only the strategist can move principal", async function () {
    await deposit(100_000);
    await expect(vault.connect(user).sweepToEarn(1)).to.be.revertedWith("not strategist");
    await expect(vault.connect(user).redeemFromEarn(1)).to.be.revertedWith("not strategist");
  });

  it("quitEarn rejects unknown batchers", async function () {
    await expect(vault.quitEarn(user.address, 1)).to.be.revertedWith("unknown batcher");
  });

  it("earn stays disabled on vaults wired with zero addresses", async function () {
    const bare = (await (
      await ethers.getContractFactory("CacheVault")
    ).deploy(
      tokenAddress,
      await pool.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      strategist.address,
    )) as CacheVault;
    await expect(bare.connect(strategist).sweepToEarn(1)).to.be.revertedWith("earn disabled");
  });
});
