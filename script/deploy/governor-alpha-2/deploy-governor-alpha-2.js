const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const xvsAddress = contractConfigData.Tokens.XVS.address;
  const guardian = contractConfigData.Accounts.Guardian;
  const constructorArgumentArray = [timelockAddress, xvsAddress, guardian, 100];
  console.log(
    `Deploying GovernorAlpha2 with timelockAddress, xvsAddress, guardian in constructorArguments: ${constructorArgumentArray}`,
  );

  let deployedGovernorAlpha2 = await saddle.deploy("GovernorAlpha2", constructorArgumentArray);
  const constructorData = web3.eth.abi.encodeParameters(
    ["address", "address", "address", "uint256"],
    constructorArgumentArray,
  );
  console.log(`Deployed GovernorAlpha2 to ${deployedGovernorAlpha2._address} with constructorData: ${constructorData}`);
})();
