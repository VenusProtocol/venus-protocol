require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);
const { bnbMantissa } = require('../deploy/utils/web3-utils');
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();

  const GovernorBravoDelegatorContract = await ethers.getContractFactory("GovernorBravoDelegator");

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
    guardian, { gasLimit: 10000000 }
  );

  await governorBravoDelegatorContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed GovernorBravoDelegator at address: ${governorBravoDelegatorContractInstance.address}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


