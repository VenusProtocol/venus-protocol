require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");
const hre = require("hardhat");

const main = async () => {

  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;

  await hre.run("verify:verify", {
    address: xvsStoreAddress
  });
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });