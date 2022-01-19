const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

task("deploy-xvs-vault-proxy", "deploys XVSVaultProxy contract")
  .setAction(async (args, hre) => {
    const xvsVaultProxyContract = await hre.ethers.getContractFactory(`contracts/XVSVault/XVSVaultProxy.sol:XVSVaultProxy`);
    const xvsVaultProxyContractInstance = await xvsVaultProxyContract.deploy();
    await xvsVaultProxyContractInstance.deployed();
    console.log(`deployed XVSVaultProxy at address: ${xvsVaultProxyContractInstance.address}`);
  });
