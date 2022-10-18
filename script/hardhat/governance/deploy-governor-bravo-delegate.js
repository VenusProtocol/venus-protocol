require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  const GovernorBravoDelegateContract = await ethers.getContractFactory("GovernorBravoDelegate");
  const governorBravoDelegateContractInstance = await GovernorBravoDelegateContract.deploy();
  await governorBravoDelegateContractInstance.deployed();
  console.log(
    `deployer: ${deployer} deployed GovernorBravoDelegate at address: ${governorBravoDelegateContractInstance.address}`,
  );
  return governorBravoDelegateContractInstance;
};

module.exports = main;
