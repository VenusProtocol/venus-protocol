const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa } = require("../utils/web3-utils");

(async () => {
  const xvsAddress = contractConfigData.Contracts.XVS;
  const xvsInstance = await saddle.getContractAt("XVS", xvsAddress);

  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const approvalAmount = bnbMantissa(1e10);
  const approveXVSSpendingTxn = await xvsInstance.methods.approve(xvsVaultAddress, approvalAmount).send();

  console.log(
    `XVS -> approved spending for : ${approvalAmount} to xvsVaultAddress: ${xvsVaultAddress} - with transactionStatus: ${approveXVSSpendingTxn.status}`,
  );
})();
