const [network, tokenSymbol] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbUnsigned } = require("../utils/web3-utils");

(async () => {
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const xvsVaultContractInstance = await saddle.getContractAt("XVSVault", xvsVaultProxyAddress);
  const xvsVaultPoolConfig = contractConfigData.XVSVaultPools[tokenSymbol];

  const _rewardToken = contractConfigData.Contracts.XVS;
  const _allocPoint = xvsVaultPoolConfig.allocPoint;
  const _token = contractConfigData.Contracts[tokenSymbol];
  const _rewardPerBlock = bnbUnsigned(xvsVaultPoolConfig.rewardPerBlock);
  const _lockPeriod = xvsVaultPoolConfig.lockPeriod;
  const _withUpdate = xvsVaultPoolConfig.withUpdate;

  console.log(`XVSVault -> Adding ${tokenSymbol}: ${_token} as tokenPool 
  \n XVS :${_rewardToken} as RewardToken
  \n allocPoint: ${_allocPoint}
   \n rewardPerBlock: ${_rewardPerBlock}
   \n lockPeriod: ${_lockPeriod} 
   \n witnUpdate: ${_withUpdate}`);

  const createXVSTokenPoolOnXVSVaultTxn = await xvsVaultContractInstance.methods
    .add(_rewardToken, _allocPoint, _token, _rewardPerBlock, _lockPeriod)
    .send();

  console.log(`XVS -> created TokenPool for: ${_rewardToken} on xvsVaultProxyAddress: ${xvsVaultProxyAddress} 
    - with transactionStatus: ${createXVSTokenPoolOnXVSVaultTxn.status}`);
})();
