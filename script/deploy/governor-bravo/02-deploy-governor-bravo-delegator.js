const contractConfigData = require("../../../networks/testnet.json");
const { bnbMantissa } = require('../utils/web3-utils');

(async () => {
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const admin = contractConfigData.Contracts.Guardian;
  const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
  const votingPeriod = 200;
  const votingDelay = 1;
  const proposalThreshold = bnbMantissa(1e4);
  const guardian = contractConfigData.Accounts.Guardian;

  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;
  const governorAlpha2ContractInstance = await saddle.getContractAt('GovernorAlpha2', governorAlpha2Address);
  const proposalCount = await governorAlpha2ContractInstance.methods.proposalCount().call();

  const constructorArgumentArray = [timelockAddress, xvsVaultAddress, admin, governorBravoDelegateAddress, votingPeriod, votingDelay, proposalThreshold, guardian, proposalCount];
  console.log(`Deploying GovernorAlpha2 with timelockAddress, xvsVaultAddress, admin, governorBravoDelegateAddress, votingPeriod, votingDelay, proposalThreshold, guardian, proposalCount in constructorArguments: ${constructorArgumentArray}`);
  
  let deployedGovernorBravoDelegator = await saddle.deploy('GovernorBravoDelegator', constructorArgumentArray);
  const constructorData = web3.eth.abi.encodeParameters(['address','address','address', 'address','uint256','uint256', 'uint256','address','uint8'], constructorArgumentArray);
  console.log(`Deployed GovernorBravoDelegator to ${deployedGovernorBravoDelegator._address} with constructorData: ${constructorData}`);
})();
