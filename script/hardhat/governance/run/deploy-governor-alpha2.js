const main = require('../deploy-governor-alpha2')
const contractConfigData = require(`../../../../networks/testnet.json`);

const timelockAddress = contractConfigData.Contracts.Timelock;
const xvsVaultAddress = contractConfigData.Contracts.XVSVaultProxy;
const guardianAddress = contractConfigData.Accounts.Guardian;
const lastProposalId = 20;

main({ timelockAddress, xvsVaultAddress, guardianAddress, lastProposalId }).then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});
