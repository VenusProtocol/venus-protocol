const main = require('../deploy-governor-alpha')
const contractConfigData = require(`../../../../networks/testnet.json`);

const timelockAddress = contractConfigData.Contracts.Timelock;
const xvsVaultAddress = contractConfigData.Contracts.XVSVaultProxy;
const guardianAddress = contractConfigData.Accounts.Guardian;

main({ timelockAddress, xvsVaultAddress, guardianAddress }).then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});
