const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-xvs-store", "verifies deployed XVSStore contract")
  .setAction(async (args, hre) => {

   const xvsStoreAddress = contractConfigData.Contracts.XVSStore;

   await hre.run("verify:verify", {
      address: xvsStoreAddress
    });
});
