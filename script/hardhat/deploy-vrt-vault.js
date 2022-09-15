require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log(`deployer: ${deployer}`);
  const vrtVaultContract = await ethers.getContractFactory("VRTVault");

  const vrtVaultContractInstance = await vrtVaultContract.deploy();
  await vrtVaultContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed VRTVault at address: ${vrtVaultContractInstance.address}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });