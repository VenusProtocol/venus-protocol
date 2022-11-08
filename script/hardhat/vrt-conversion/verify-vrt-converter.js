require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
  const vrtConverterAddress = contractConfigData.Contracts.VRTConverter;
  await hre.run("verify:verify", {
    address: vrtConverterAddress,
  });
};

module.exports = main;
