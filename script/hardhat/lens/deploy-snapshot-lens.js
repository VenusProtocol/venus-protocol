require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const hre = require("hardhat");
const ethers = hre.ethers;
const { getDeployer } = require("../../deploy/utils/web3-utils");

const main = async () => {
  const SnapshotLensContract = await ethers.getContractFactory("SnapshotLens");
  const snapshotLensContractInstance = await SnapshotLensContract.deploy({ gasLimit: 10000000 });
  await snapshotLensContractInstance.deployed();
  const deployer = await getDeployer(ethers);
  console.log(`deployer: ${deployer} has deployed snapshotLens at address: ${snapshotLensContractInstance.address}`);
  return snapshotLensContractInstance;
};

module.exports = main;
