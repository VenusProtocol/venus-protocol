const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt("XVSVault", xvsVaultAddress);
  const address = "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706";
  const currentVotes = await xvsVaultContractInstance.methods.getCurrentVotes(address).call();
  console.log(`XVSVault -> has votes: ${currentVotes} for accont: ${address}`);
})();
