const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

task("deploy-xvs-store", "deploys XVSStore contract")
  .setAction(async (args, hre) => {
    const xvsStoreContract = await hre.ethers.getContractFactory(`contracts/XVSVault/XVSStore.sol:XVSStore`);
    const xvsStoreContractInstance = await xvsStoreContract.deploy();
    await xvsStoreContractInstance.deployed();
    console.log(`deployed xvsStore at address: ${xvsStoreContractInstance.address}`);
  });
