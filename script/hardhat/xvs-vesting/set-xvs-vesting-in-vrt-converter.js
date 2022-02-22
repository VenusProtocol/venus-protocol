require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {

    const _vrtConverterAddress = contractConfigData.Contracts.VRTConverter;

    //load VRTConverter Instance
    const vrtConverterContractInstance = await ethers.getContractAt(
        "VRTConverter",
        _vrtConverterAddress
    );

    const _xvsVestingAddress = contractConfigData.Contracts.XVSVesting;

    //set XVSVesting-Address in VRTConverter
    const txResponse = await vrtConverterContractInstance._setXVSVesting(_xvsVestingAddress);
    await txResponse.wait();
    console.log(`txResponse to set XVSVesting-Address in VRTConverter is: ${JSON.stringify(txResponse)}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });