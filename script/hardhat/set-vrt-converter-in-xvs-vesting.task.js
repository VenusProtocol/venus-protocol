const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);

task("set-vrt-converter-in-xvs-vesting", "sets VRTConverter Address in XVSVesting contract")
    .setAction(async (args, hre) => {
        const _xvsVestingAddress = contractConfigData.Contracts.XVSVesting;

        //load XVSVesting Instance
        const xvsVestingContractInstance = await hre.ethers.getContractAt(
            "XVSVesting",
            _xvsVestingAddress
        );

        const _vrtConverterAddress = contractConfigData.Contracts.VRTConverter;

        //set VRTConverter-Address in XVSVesting
        const txResponse = await xvsVestingContractInstance._setVRTConversion(_vrtConverterAddress);
        await txResponse.wait();
        console.log(`txResponse to set VRTConverter-Address in XVSVesting is: ${JSON.stringify(txResponse)}`);
    });