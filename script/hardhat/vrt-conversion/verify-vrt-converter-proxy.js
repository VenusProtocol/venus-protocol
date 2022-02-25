require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa } = require('../../deploy/utils/web3-utils');
const hre = require("hardhat");

const main = async () => {

    const vrtConverterAddress = contractConfigData.Contracts.VRTConverter;
    const vrtAddress = contractConfigData.Contracts.VRT;
    const xvsAddress = contractConfigData.Contracts.XVS;
    const conversionRatio = bnbMantissa(0.000083);
    const conversionStartTime = 1645761945;
    const conversionPeriod = 360 * 24 * 60 * 60;

    const vrtConverterConstructorArgumentArray = [vrtConverterAddress, vrtAddress, xvsAddress,
        conversionRatio, conversionStartTime, conversionPeriod];

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
        constructorArguments: vrtConverterConstructorArgumentArray
    });
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });