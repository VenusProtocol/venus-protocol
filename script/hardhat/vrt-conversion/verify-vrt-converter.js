require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa } = require('../../deploy/utils/web3-utils');
const hre = require("hardhat");

const main = async () => {

    const vrtConverterAddress = contractConfigData.Contracts.VRTConverter;

    const _vrtAddress = contractConfigData.Contracts.VRT;
    const _xvsAddress = contractConfigData.Contracts.XVS;
    const _conversionRatio = bnbMantissa(0.000083);
    const _conversionStartTime = 1645450842;
    const _conversionPeriod = 360 * 24 * 60 * 60;

    const vrtConverterConstructorArgumentArray = [_vrtAddress, _xvsAddress, _conversionRatio, _conversionStartTime, _conversionPeriod];
    console.log(`Verifying VRTConverter with _vrtAddress, _xvsAddress, _conversionRatio, _conversionStartTime, _conversionPeriod in constructorArguments: ${vrtConverterConstructorArgumentArray}`);

    await hre.run("verify:verify", {
        address: vrtConverterAddress,
        constructorArguments: vrtConverterConstructorArgumentArray
    });
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });