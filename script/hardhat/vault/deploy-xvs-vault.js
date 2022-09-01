require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const xvsVaultContract = await ethers.getContractFactory("XVSVault");
  const xvsVaultContractInstance = await xvsVaultContract.deploy();
  await xvsVaultContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed XVSVault at address: ${xvsVaultContractInstance.address}`);
  return xvsVaultContractInstance;
};

module.exports = main;
