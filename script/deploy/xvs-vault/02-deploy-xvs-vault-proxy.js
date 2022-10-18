const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  console.log(`Deploying XVSVaultProxy with admin: ${contractConfigData.Accounts.Guardian}`);
  let deployedXVSVaultProxy = await saddle.deploy("XVSVaultProxy");
  console.log(`Deployed XVSVaultProxy to ${deployedXVSVaultProxy._address}`);
})();
