require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);

const main = async () => {
  const vrtConverterProxyAddress = contractConfigData.Contracts.VRTConverterProxy;
  const xvsVestingProxyAddress = contractConfigData.Contracts.XVSVestingProxy;

  const vrtConverterProxy = await ethers.getContractAt("VRTConverter", vrtConverterProxyAddress);
  const setXVSVestingTxn = await vrtConverterProxy.setXVSVesting(xvsVestingProxyAddress);

  console.log(`completed setXVSVesting: ${xvsVestingProxyAddress} with txn: ${JSON.stringify(setXVSVestingTxn)}`);
};

module.exports = main;
