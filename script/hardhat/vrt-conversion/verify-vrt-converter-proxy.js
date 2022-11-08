require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
  const vrtConverterAddress = contractConfigData.Contracts.VRTConverter;
  const vrtAddress = contractConfigData.Contracts.VRT;
  const xvsAddress = contractConfigData.Contracts.XVS;
  const conversionRatio = 83333333333000;
  const conversionStartTime = 1647323525;
  const conversionPeriod = 365 * 24 * 60 * 60;

  const vrtConverterConstructorArgumentArray = [
    vrtConverterAddress,
    vrtAddress,
    xvsAddress,
    conversionRatio,
    conversionStartTime,
    conversionPeriod,
  ];

  console.log(`VRTConverterProxy with 
                vrtConverterAddress: ${vrtConverterAddress} 
                vrtAddress: ${vrtAddress}
                xvsAddress: ${xvsAddress}
                conversionRatio: ${conversionRatio}
                conversionStartTime: ${conversionStartTime}
                conversionPeriod: ${conversionPeriod}`);

  const vrtConverterProxyAddress = contractConfigData.Contracts.VRTConverterProxy;

  await hre.run("verify:verify", {
    address: vrtConverterProxyAddress,
    constructorArguments: vrtConverterConstructorArgumentArray,
  });
};

module.exports = main;
