require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const xvsVaultProxyContract = await ethers.getContractFactory("XVSVaultProxy");
  const xvsVaultProxyContractInstance = await xvsVaultProxyContract.deploy();
  await xvsVaultProxyContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed XVSVaultProxy at address: ${xvsVaultProxyContractInstance.address}`);
  return xvsVaultProxyContractInstance;
};

module.exports = main;
