const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const vBNBConfig = contractConfigData.Tokens.vBNB;
  console.log(`Deploying Maximillion with vBNBAddress: ${vBNBConfig.address} `);
  const constructorArgumentArray = [vBNBConfig.address];
  let deployedMaximillion = await saddle.deploy('Maximillion', constructorArgumentArray);
  const constructorData = web3.eth.abi.encodeParameters(['address'], constructorArgumentArray);
  console.log(`Deployed Maximillion to ${deployedMaximillion._address} and constructor data: ${constructorData}`);
})();
