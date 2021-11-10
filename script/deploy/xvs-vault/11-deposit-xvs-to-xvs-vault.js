const contractConfigData = require("../../../networks/testnet.json");
const { bnbMantissa } = require('../utils/web3-utils');

(async () => {

  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt('XVSVault', xvsVaultAddress);

  const xvsAddress = contractConfigData.Contracts.XVS;
  const amount = bnbMantissa(1e4);
  const depositXVSToXVSVaultTxn = await xvsVaultContractInstance.methods.deposit(xvsAddress, 0, amount).send();

  console.log(`XVS -> deposit : ${amount} to xvsVaultAddress: ${xvsVaultAddress} - with transactionStatus: ${depositXVSToXVSVaultTxn.status}`);
})();
