require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
const network = process.env.NETWORK;
const contractConfigData = require(`../../networks/${network}.json`);
const { bnbUnsigned } = require('../deploy/utils/web3-utils');

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();
  console.log(`[VRTVaultProxy] deployer is: ${deployer}`);

  const vrtVaultProxyContract = await ethers.getContractFactory("VRTVaultProxy");

  const vrtVaultAddress = contractConfigData.Contracts.VRTVault;
  const vrtAddress = contractConfigData.Contracts.VRT;
  const interestRatePerBlockAsNumber = bnbUnsigned(28935185000);

  const vrtVaultProxyContractInstance = await vrtVaultProxyContract.deploy(vrtVaultAddress, vrtAddress, interestRatePerBlockAsNumber);
  await vrtVaultProxyContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed VRTVaultProxy at address: ${vrtVaultProxyContractInstance.address}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });