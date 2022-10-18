require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
const { getDeployer } = require("../../deploy/utils/web3-utils");

const main = async () => {
  const VenusLensContract = await ethers.getContractFactory("VenusLens");
  const venuLensContractInstance = await VenusLensContract.deploy({ gasLimit: 10000000 });
  await venuLensContractInstance.deployed();
  const deployer = await getDeployer(ethers);
  console.log(`deployer: ${deployer} has deployed VenusLens at address: ${venuLensContractInstance.address}`);
  return venuLensContractInstance;
};

module.exports = main;
