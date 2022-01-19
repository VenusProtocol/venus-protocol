const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-governor-bravo-delegate", "verifies deployed GovernorBravoDelegate contract")
  .setAction(async (args, hre) => {
    const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;

    await hre.run("verify:verify", {
       address: governorBravoDelegateAddress
     });
 
  });
