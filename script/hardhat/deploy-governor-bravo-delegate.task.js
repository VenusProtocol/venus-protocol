const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

task("deploy-governor-bravo-delegate", "deploys GovernorBravoDelegate contract")
  .setAction(async (args, hre) => {
    const GovernorBravoDelegateContract = await hre.ethers.getContractFactory(`contracts/Governance/GovernorBravoDelegate.sol:GovernorBravoDelegate`);
    const governorBravoDelegateContractInstance = await GovernorBravoDelegateContract.deploy();
    await governorBravoDelegateContractInstance.deployed();
    console.log(`deployed GovernorBravoDelegate at address: ${governorBravoDelegateContractInstance.address}`);
  });
