const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt('XVSVault', xvsVaultAddress);
  const address = '0x2ce1d0ffd7e869d9df33e28552b12ddded326706';
  const currentVotes = await xvsVaultContractInstance.methods.getCurrentVotes(address).call();
  console.log(`XVSVault -> has votes: ${currentVotes} for accont: ${address}`);
})();
