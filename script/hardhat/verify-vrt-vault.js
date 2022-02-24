require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../networks/${network}.json`);
const hre = require("hardhat");
require("@nomiclabs/hardhat-etherscan");

const main = async () => {
  const vrtVaultAddress = contractConfigData.Contracts.VRTVault;

  await hre.run("verify:verify", {
    address: vrtVaultAddress,
  });
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });