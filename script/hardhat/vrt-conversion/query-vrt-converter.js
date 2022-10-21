require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {
  const vrtConverterProxyAddress = contractConfigData.Contracts.VRTConverterProxy;
  const vrtConverterProxy = await ethers.getContractAt("VRTConverter", vrtConverterProxyAddress);
  const conversionRatio = await vrtConverterProxy.conversionRatio();

  console.log(`conversionRatio of VRTConverter: ${conversionRatio}`);
};

module.exports = main;
