require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async ({ timelockAddress, xvsVaultAddress, guardianAddress }) => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const GovernorAlphaDelegateContract = await ethers.getContractFactory("GovernorAlpha");
  const governorAlphaDelegateContractInstance = await GovernorAlphaDelegateContract.deploy(
    timelockAddress,
    xvsVaultAddress,
    guardianAddress,
  );
  await governorAlphaDelegateContractInstance.deployed();
  console.log(
    `deployer: ${deployer} deployed GovernorAlphaDelegate at address: ${governorAlphaDelegateContractInstance.address}`,
  );
  return governorAlphaDelegateContractInstance;
};

module.exports = main;
