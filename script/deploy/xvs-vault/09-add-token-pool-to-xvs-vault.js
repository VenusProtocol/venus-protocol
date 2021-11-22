const contractConfigData = require("../../../networks/testnet.json");
const { bnbUnsigned } = require('../utils/web3-utils');

(async () => {

  const XVSVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt('XVSVault', XVSVaultAddress);

  const _rewardToken = contractConfigData.Contracts.XVS;
  const _allocPoint = 100;
  const _token = contractConfigData.Contracts.XVS;
  const _rewardPerBlock = bnbUnsigned(1e16);
  const _lockPeriod = 300;
  const _withUpdate = 0;

  const createXVSTokenPoolOnXVSVaultTxn = await xvsVaultContractInstance.methods.add(_rewardToken, _allocPoint, _token,
    _rewardPerBlock, _lockPeriod, _withUpdate).send();

  console.log(`XVS -> created TokenPool for: ${_rewardToken} on XVSVaultAddress: ${XVSVaultProxyAddress} 
    - with transactionStatus: ${createXVSTokenPoolOnXVSVaultTxn.status}`);
})();
