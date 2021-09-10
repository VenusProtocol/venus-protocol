const contractConfigData = require("../../../networks/testnet.json");

(async () => {  
  console.log(`Deploying XVSVault with admin: ${contractConfigData.Accounts.Guardian}`);
  let deployedXVSVault = await saddle.deploy('XVSVault');
  console.log(`Deployed XVSVault to ${deployedXVSVault._address}`);
})();
