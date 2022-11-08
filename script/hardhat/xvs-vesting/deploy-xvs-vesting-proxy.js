require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { getDeployer } = require("../../deploy/utils/web3-utils");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
  const xvsVestingAddress = contractConfigData.Contracts.XVSVesting;
  const xvsAddress = contractConfigData.Contracts.XVS;

  console.log(`XVSVestingProxy with 
    xvsVestingAddress: ${xvsVestingAddress} 
    xvsAddress: ${xvsAddress}`);

  const XVSVestingProxy = await ethers.getContractFactory("XVSVestingProxy");

  const xvsVestingProxyInstance = await XVSVestingProxy.deploy(xvsVestingAddress, xvsAddress, { gasLimit: 10000000 });

  await xvsVestingProxyInstance.deployed();

  const deployer = await getDeployer(ethers);
  console.log(`deployer: ${deployer} has deployed XVSVestingProxy at address: ${xvsVestingProxyInstance.address}`);
  return xvsVestingProxyInstance;
};

module.exports = main;
