require("dotenv").config();
const hre = require("hardhat");
const network = process.env.NETWORK;
const contractConfigData = require(`../../networks/${network}.json`);
require("@nomiclabs/hardhat-etherscan");
const { bnbUnsigned } = require('../deploy/utils/web3-utils');

const main = async () => {

  const vrtVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;

  const vrtVaultAddress = contractConfigData.Contracts.VRTVault;
  const vrtAddress = contractConfigData.Contracts.VRT;
  const interestRatePerBlockAsNumber = bnbUnsigned(28935185000);

  const constructorArgumentArray = [vrtVaultAddress, vrtAddress, interestRatePerBlockAsNumber];
  console.log(`Verifying VRTVaultProxy with vrtVaultAddress, vrtAddress, interestRatePerBlockAsNumber in constructorArguments: ${constructorArgumentArray}`);

  await hre.run("verify:verify", {
    address: vrtVaultProxyAddress,
    constructorArguments: constructorArgumentArray
  });
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });