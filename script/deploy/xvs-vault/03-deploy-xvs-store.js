const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  console.log(`Deploying XVSStore with admin: ${contractConfigData.Accounts.admin}`);
  let deployedXVSStore = await saddle.deploy("XVSStore");
  console.log(`Deployed XVSStore to ${deployedXVSStore._address}`);
})();
