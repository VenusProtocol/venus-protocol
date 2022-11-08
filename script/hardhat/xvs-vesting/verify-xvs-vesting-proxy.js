require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
  const xvsVestingAddress = contractConfigData.Contracts.XVSVesting;
  const xvsAddress = contractConfigData.Contracts.XVS;

  const xvsVestingConstructorArgumentArray = [xvsVestingAddress, xvsAddress];
  console.log(`Verifying XVSVesting with constructorArguments: ${xvsVestingConstructorArgumentArray}`);

  const xvsVestingProxyAddress = contractConfigData.Contracts.XVSVestingProxy;
  await hre.run("verify:verify", {
    address: xvsVestingProxyAddress,
    constructorArguments: xvsVestingConstructorArgumentArray,
  });
};

module.exports = main;
