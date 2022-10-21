require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;
const { getDeployer } = require("../../deploy/utils/web3-utils");

const main = async () => {
  const VRTConverterContract = await ethers.getContractFactory("VRTConverter");
  const vrtConverterContractInstance = await VRTConverterContract.deploy({ gasLimit: 10000000 });
  await vrtConverterContractInstance.deployed();

  const deployer = await getDeployer(ethers);
  console.log(
    `deployer: ${deployer} has deployed vrtConverterContract at address: ${vrtConverterContractInstance.address}`,
  );
  return vrtConverterContractInstance;
};

module.exports = main;
