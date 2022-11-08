require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const { getDeployer } = require("../../deploy/utils/web3-utils");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const XVSVestingContract = await ethers.getContractFactory("XVSVesting");
  const xvsVestingContractInstance = await XVSVestingContract.deploy();
  await xvsVestingContractInstance.deployed({ gasLimit: 10000000 });

  const deployer = await getDeployer(ethers);
  console.log(`deployer: ${deployer} has deployed xvsVesting at address: ${xvsVestingContractInstance.address}`);
  return xvsVestingContractInstance;
};

module.exports = main;
