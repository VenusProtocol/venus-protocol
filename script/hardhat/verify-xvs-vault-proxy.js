require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");
const hre = require("hardhat");

const main = async () => {

  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;

  await hre.run("verify:verify", {
    address: xvsVaultProxyAddress
  });
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });