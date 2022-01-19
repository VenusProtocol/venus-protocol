const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("deploy-xvs-vault", "deploys XVSVault contract")
  .setAction(async (args, hre) => {
    const xvsVaultContract = await hre.ethers.getContractFactory(`contracts/XVSVault/XVSVault.sol:XVSVault`);
    const xvsVaultContractInstance = await xvsVaultContract.deploy();
    await xvsVaultContractInstance.deployed();
    console.log(`deployed XVSVault at address: ${xvsVaultContractInstance.address}`);
  });
