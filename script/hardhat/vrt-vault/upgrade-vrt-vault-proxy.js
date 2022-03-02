require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();

  const vrtVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;
  const vrtVaultProxyInstance = await ethers.getContractAt("VRTVaultProxy", vrtVaultProxyAddress);
  const vrtVaultImplementationFromProxy_Before_Upgrade = await vrtVaultProxyInstance.implementation();

  const vrtVaultAddress = contractConfigData.Contracts.VRTVault;
  await vrtVaultProxyInstance._setPendingImplementation(vrtVaultAddress);

  const vrtVaultInstance = await ethers.getContractAt("VRTVault", vrtVaultAddress);
  await vrtVaultInstance._become(vrtVaultProxyAddress);

  const vrtVaultImplementationFromProxy = await vrtVaultProxyInstance.implementation();

  console.log(`admin: ${deployer} has successfully upgraded VRTVaultProxy with implementation: ${vrtVaultImplementationFromProxy} from: ${vrtVaultImplementationFromProxy_Before_Upgrade}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });