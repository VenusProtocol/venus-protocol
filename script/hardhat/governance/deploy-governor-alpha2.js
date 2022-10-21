require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async ({ timelockAddress, xvsVaultAddress, guardianAddress, lastProposalId }) => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const GovernorAlpha2Contract = await ethers.getContractFactory("GovernorAlpha2");
  const governorAlpha2ContractInstance = await GovernorAlpha2Contract.deploy(
    timelockAddress,
    xvsVaultAddress,
    guardianAddress,
    lastProposalId,
  );
  await governorAlpha2ContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed GovernorAlpha2 at address: ${governorAlpha2ContractInstance.address}`);
  return governorAlpha2ContractInstance;
};

module.exports = main;
