import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer: ${deployer.address}`);
  console.log(`balance:  ${ethers.formatEther(bal)} ETH`);
}
main().catch(console.error);
