require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");
const hre = require("hardhat");

const main = async () => {
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;

  await hre.run("verify:verify", {
    address: xvsVaultAddress
  });
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });