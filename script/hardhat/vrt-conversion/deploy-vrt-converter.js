require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa } = require('../../deploy/utils/web3-utils');
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
    const signers = await ethers.getSigners();
    const deployer = await signers[0].getAddress();
    console.log(`deployer: ${deployer}`);

    const VRTConverterContract = await ethers.getContractFactory("VRTConverter");

    const _vrtAddress = contractConfigData.Contracts.VRT;
    const _xvsAddress = contractConfigData.Contracts.XVS;
    const _conversionRatio = bnbMantissa(0.000083);
    const _conversionStartTime = 1645450842;
    const _conversionPeriod = 360 * 24 * 60 * 60;

    const vrtConverterContractInstance = await VRTConverterContract.deploy(
        _vrtAddress,
        _xvsAddress,
        _conversionRatio,
        _conversionStartTime,
        _conversionPeriod, { gasLimit: 10000000 }
    );

    await vrtConverterContractInstance.deployed();
    console.log(`deployed vrtConverterContract at address: ${vrtConverterContractInstance.address}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });