const main = require('../deploy-governor-bravo-delegator');
const contractConfigData = require(`../../../../networks/testnet.json`);

const timelockAddress = contractConfigData.Contracts.Timelock;
const xvsVaultAddress = contractConfigData.Contracts.XVSVaultProxy;
const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
const guardianAddress = contractConfigData.Accounts.Guardian;

main({ timelockAddress, xvsVaultAddress, guardianAddress, governorBravoDelegateAddress }).then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
