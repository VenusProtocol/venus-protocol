require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../networks/${network}.json`);

const main = async () => {
  const vrtVaultAddress = contractConfigData.Contracts.VRTVault;
  const vrtVaultInstance = await ethers.getContractAt("VRTVault", vrtVaultAddress);

  const vrtVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;
  const acceptImplementationTxn = await vrtVaultInstance._become(vrtVaultProxyAddress);
  
  console.log(`acceptImplementationTxn is: ${JSON.stringify(acceptImplementationTxn)}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });