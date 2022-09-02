require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {
  const vrtVaultAddress = contractConfigData.Contracts.VRTVault;
  const vrtVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;
  const vrtVaultProxyInstance = await ethers.getContractAt("VRTVaultProxy", vrtVaultProxyAddress);
  const setPendingImplementationTxn = await vrtVaultProxyInstance._setPendingImplementation(vrtVaultAddress);
  console.log(`setPendingImplementationTxn is: ${JSON.stringify(setPendingImplementationTxn)}`);
};

module.exports = main;
