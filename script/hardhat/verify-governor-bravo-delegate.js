require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");
const hre = require("hardhat");

const main = async () => {
  const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;

  await hre.run("verify:verify", {
    address: governorBravoDelegateAddress
  });
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });