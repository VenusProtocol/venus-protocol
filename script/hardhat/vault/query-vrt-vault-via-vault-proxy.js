require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {
  const vrtVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;
  const vrtVaultProxyInstance = await ethers.getContractAt("VRTVault", vrtVaultProxyAddress);
  const vrt = await vrtVaultProxyInstance.vrt();
  const interestRatePerBlock = await vrtVaultProxyInstance.interestRatePerBlock();
  console.log(`vrt is: ${vrt} - interestRatePerBlock: ${interestRatePerBlock}`);
};

module.exports = main;
