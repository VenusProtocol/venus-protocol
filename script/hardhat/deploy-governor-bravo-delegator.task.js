const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);
const { bnbMantissa } = require('../deploy/utils/web3-utils');

task("deploy-governor-bravo-delegator", "deploys GovernorBravoDelegator contract")
  .setAction(async (args, hre) => {
    const GovernorBravoDelegatorContract = await hre.ethers.getContractFactory(`contracts/Governance/GovernorBravoDelegator.sol:GovernorBravoDelegator`);

    const timelockAddress = contractConfigData.Contracts.Timelock;
    const xvsVaultAddress = contractConfigData.Contracts.XVSVaultProxy;
    const admin = contractConfigData.Accounts.Guardian;
    const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
    const votingPeriod = 200;
    const votingDelay = 1;
    const proposalThreshold = bnbMantissa(1e4);
    const guardian = contractConfigData.Accounts.Guardian;

    const constructorArgumentArray = [timelockAddress, xvsVaultAddress, admin, governorBravoDelegateAddress, votingPeriod, votingDelay, proposalThreshold, guardian];
    console.log(`Deploying GovernorBravoDelegator with timelockAddress, xvsVaultAddress, admin, governorBravoDelegateAddress, votingPeriod, votingDelay, proposalThreshold, guardian in constructorArguments: ${constructorArgumentArray}`);

    const governorBravoDelegatorContractInstance = await GovernorBravoDelegatorContract.deploy(
      timelockAddress,
      xvsVaultAddress,
      admin,
      governorBravoDelegateAddress,
      votingPeriod,
      votingDelay,
      proposalThreshold,
      guardian , { gasLimit: 10000000 }
    );

    await governorBravoDelegatorContractInstance.deployed();
    console.log(`deployed GovernorBravoDelegator at address: ${governorBravoDelegatorContractInstance.address}`);
  });
