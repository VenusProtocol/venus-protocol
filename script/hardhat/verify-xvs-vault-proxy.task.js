const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-xvs-vault-proxy", "verifies deployed XVSVaultProxy contract")
  .setAction(async (args, hre) => {

   const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;

   await hre.run("verify:verify", {
      address: xvsVaultProxyAddress
    });
});
