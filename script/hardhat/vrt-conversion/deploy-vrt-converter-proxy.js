require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa, getEpochTimeInSeconds, getDeployer } = require('../../deploy/utils/web3-utils');
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
    const VRTConverterProxyContract = await ethers.getContractFactory("VRTConverterProxy");

    const vrtConverterAddress = contractConfigData.Contracts.VRTConverter;
    const vrtAddress = contractConfigData.Contracts.VRT;
    const xvsAddress = contractConfigData.Contracts.XVS;
    const conversionRatio = bnbMantissa(0.000083);
    const conversionStartTime = getEpochTimeInSeconds() + 1000;
    const conversionPeriod = 360 * 24 * 60 * 60;

    console.log(`VRTConverterProxy with 
                vrtConverterAddress: ${vrtConverterAddress} 
                vrtAddress: ${vrtAddress}
                xvsAddress: ${xvsAddress}
                conversionRatio: ${conversionRatio}
                conversionStartTime: ${conversionStartTime}
                conversionPeriod: ${conversionPeriod}`);

    const vrtConverterProxyContractInstance = await VRTConverterProxyContract.deploy(
        vrtConverterAddress,
        vrtAddress,
        xvsAddress,
        conversionRatio,
        conversionStartTime,
        conversionPeriod, { gasLimit: 10000000 }
    );

    await vrtConverterProxyContractInstance.deployed();

    const deployer = await getDeployer(ethers);
    console.log(`${deployer} deployed vrtConverterProxyContract at address: ${vrtConverterProxyContractInstance.address}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });