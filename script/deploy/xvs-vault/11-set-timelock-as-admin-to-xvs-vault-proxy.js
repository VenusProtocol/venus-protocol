const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxyAddress;
  const xvsVaultProxyContractInstance = await saddle.getContractAt("XVSVaultProxy", xvsVaultProxyAddress);
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const setPendingAdminToXVSVaultProxyTxn = await xvsVaultProxyContractInstance.methods
    ._setPendingAdmin(timelockAddress)
    .send();
  console.log(
    `Timelock -> ${timelockAddress} as PendingAdmin to XVSVaultProxy: ${xvsVaultProxyAddress} has txnStatus: ${setPendingAdminToXVSVaultProxyTxn.status}`,
  );
})();
