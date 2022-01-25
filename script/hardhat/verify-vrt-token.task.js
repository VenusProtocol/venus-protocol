const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-vrt-token", "verifies deployed VRT Token contract")
  .setAction(async (args, hre) => {
    const vrtAddress = contractConfigData.Contracts.VRT;
    const tokenAdmin = contractConfigData.Accounts.admin;

    const vrtTokenConstructorArgumentArray = [tokenAdmin];
    console.log(`Verifying VRT with tokenAdmin in constructorArguments: ${vrtTokenConstructorArgumentArray}`);

    await hre.run("verify:verify", {
      address: vrtAddress,
      constructorArguments: vrtTokenConstructorArgumentArray
    });
  });