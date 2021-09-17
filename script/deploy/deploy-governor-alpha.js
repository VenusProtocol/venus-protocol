const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const admin = contractConfigData.admin;
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const xvsAddress = contractConfigData.Tokens.XVS.address;
  const guardian = admin;
  const constructorArgumentArray = [timelockAddress, xvsAddress, guardian];
  console.log(`Deploying GovernorAlpha with timelockAddress, xvsAddress, guardian in constructorArguments: ${constructorArgumentArray}`);
  
  let deployedGovernorAlpha = await saddle.deploy('GovernorAlpha', constructorArgumentArray);
  const constructorData = web3.eth.abi.encodeParameters(['address','address','address'], constructorArgumentArray);
  console.log(`Deployed GovernorAlpha to ${deployedGovernorAlpha._address} with constructorData: ${constructorData}`);
})();
