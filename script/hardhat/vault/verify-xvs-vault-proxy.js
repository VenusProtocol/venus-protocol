require("dotenv").config();
const contractConfigData = require("../../../networks/testnet.json");
const hre = require("hardhat");

const main = async () => {
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;

  await hre.run("verify:verify", {
    address: xvsVaultProxyAddress,
  });
};

module.exports = main;
