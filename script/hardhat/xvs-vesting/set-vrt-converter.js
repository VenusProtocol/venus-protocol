require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {
  const xvsVestingProxyAddress = contractConfigData.Contracts.XVSVestingProxy;

  const xvsVestingProxy = await ethers.getContractAt("XVSVesting", xvsVestingProxyAddress);

  const vrtConverterProxyAddress = contractConfigData.Contracts.VRTConverterProxy;
  const setVRTConverterTxn = await xvsVestingProxy.setVRTConverter(vrtConverterProxyAddress);

  console.log(`completed setVRTConverter: ${vrtConverterProxyAddress} with txn: ${JSON.stringify(setVRTConverterTxn)}`);
};

module.exports = main;
