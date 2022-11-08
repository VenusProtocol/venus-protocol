const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa } = require("../utils/web3-utils");

(async () => {
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const admin = contractConfigData.Accounts.Guardian;
  const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
  const votingPeriod = 200;
  const votingDelay = 1;
  const proposalThreshold = bnbMantissa(1e4);
  const guardian = contractConfigData.Accounts.Guardian;

  const constructorArgumentArray = [
    timelockAddress,
    xvsVaultAddress,
    admin,
    governorBravoDelegateAddress,
    votingPeriod,
    votingDelay,
    proposalThreshold,
    guardian,
  ];
  console.log(
    `Deploying GovernorBravoDelegator with timelockAddress, xvsVaultAddress, admin, governorBravoDelegateAddress, votingPeriod, votingDelay, proposalThreshold, guardian in constructorArguments: ${constructorArgumentArray}`,
  );

  let deployedGovernorBravoDelegator = await saddle.deploy("GovernorBravoDelegator", constructorArgumentArray);
  const constructorData = web3.eth.abi.encodeParameters(
    ["address", "address", "address", "address", "uint256", "uint256", "uint256", "address"],
    constructorArgumentArray,
  );
  console.log(
    `Deployed GovernorBravoDelegator to ${deployedGovernorBravoDelegator._address} with constructorData: ${constructorData}`,
  );
})();
