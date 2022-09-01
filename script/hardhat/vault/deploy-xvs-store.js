const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const xvsStoreContract = await ethers.getContractFactory("XVSStore");
  const xvsStoreContractInstance = await xvsStoreContract.deploy();
  await xvsStoreContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed xvsStore at address: ${xvsStoreContractInstance.address}`);
  return xvsStoreContractInstance;
};

module.exports = main;
