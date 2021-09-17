const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const admin = contractConfigData.admin;
  console.log(`Deploying XVS with admin: ${admin} `);
  const constructorArgumentArray = [admin];
  let deployedXVS = await saddle.deploy('XVS', constructorArgumentArray);
  const constructorData = web3.eth.abi.encodeParameters(['address'], constructorArgumentArray);
  console.log(`Deployed XVS to ${deployedXVS._address} with constructorData: ${constructorData}`);
})();
