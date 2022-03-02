require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbUnsigned } = require('../../deploy/utils/web3-utils');

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();

  const vrtVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;
  const vrtVaultProxyInstance = await ethers.getContractAt("VRTVault", vrtVaultProxyAddress);
  const interestRatePerBlock_Before_Update = await vrtVaultProxyInstance.interestRatePerBlock();

  const interestRatePerBlock = bnbUnsigned(contractConfigData.VRTVault.interestRatePerBlock);
  await vrtVaultProxyInstance.setInterestRate(parseInt(interestRatePerBlock));

  const interestRatePerBlock_After_Update = await vrtVaultProxyInstance.interestRatePerBlock();
  console.log(`admin: ${deployer} has successfully updated interestRatePerBlock to: ${parseInt(interestRatePerBlock_After_Update)} from: ${parseInt(interestRatePerBlock_Before_Update)}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });