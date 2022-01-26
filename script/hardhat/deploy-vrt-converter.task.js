const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);
const { bnbMantissa } = require('../deploy/utils/web3-utils');

task("deploy-vrt-converter", "deploys VRTConverter contract")
    .setAction(async (args, hre) => {
        const VRTConverterContract = await hre.ethers.getContractFactory(`contracts/VRT/VRTConverter.sol:VRTConverter`);

        const _vrtAddress = contractConfigData.Contracts.VRT;
        const _xvsAddress = contractConfigData.Contracts.XVS;
        const _xvsVestingAddress = contractConfigData.Contracts.XVSVesting;
        const _conversionRatio = bnbMantissa(0.000083);
        const _conversionStartTime = 1643173379;
        const _vrtTotalSupply = bnbMantissa(30000000000);
        
        const vrtConverterContractInstance = await VRTConverterContract.deploy(
            _vrtAddress,
            _xvsAddress,
            _xvsVestingAddress,
            _conversionRatio,
            _conversionStartTime,
            _vrtTotalSupply, { gasLimit: 10000000 }
        );

        await vrtConverterContractInstance.deployed();
        console.log(`deployed vrtConverterContract at address: ${vrtConverterContractInstance.address}`);
    });