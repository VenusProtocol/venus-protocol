const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-xvs-vault", "verifies deployed XVSVault contract")
  .setAction(async (args, hre) => {

   const xvsVaultAddress = contractConfigData.Contracts.XVSVault;

   await hre.run("verify:verify", {
      address: xvsVaultAddress
    });
});
