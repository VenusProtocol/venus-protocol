const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);

task("set-xvs-vesting-in-vrt-converter", "sets XVSVesting Address in VRTConverter contract")
    .setAction(async (args, hre) => {
        const _vrtConverterAddress = contractConfigData.Contracts.VRTConverter;

        //load VRTConverter Instance
        const vrtConverterContractInstance = await hre.ethers.getContractAt(
            "VRTConverter",
            _vrtConverterAddress
        );

        const _xvsVestingAddress = contractConfigData.Contracts.XVSVesting;

        //set XVSVesting-Address in VRTConverter
        const txResponse = await vrtConverterContractInstance._setXVSVesting(_xvsVestingAddress);
        await txResponse.wait();
        console.log(`txResponse to set XVSVestingAddress-Address in VRTConverter is: ${JSON.stringify(txResponse)}`);
    });