const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const timelockOwner = contractConfigData.admin;
  const timelockDelay = contractConfigData.Timelock.timelockDelay;  
  const constructorArgumentArray = [timelockOwner, timelockDelay];

  console.log(`Deploying Timelock with owner and timelockDelay as constructor Arguments: ${constructorArgumentArray} `);
  let deployedTimelock = await saddle.deploy('Timelock', constructorArgumentArray);

  const constructorData = web3.eth.abi.encodeParameters(['address', 'uint'], constructorArgumentArray);
  console.log(`Deployed Timelock to ${deployedTimelock._address} and constructorData: ${constructorData}`);
})();
