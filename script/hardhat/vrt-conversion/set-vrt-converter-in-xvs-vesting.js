require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {

    const _xvsVestingAddress = contractConfigData.Contracts.XVSVesting;

    //load XVSVesting Instance
    const xvsVestingContractInstance = await ethers.getContractAt(
        "XVSVesting",
        _xvsVestingAddress
    );

    const _vrtConverterAddress = contractConfigData.Contracts.VRTConverter;

    //set VRTConverter-Address in XVSVesting
    const txResponse = await xvsVestingContractInstance._setVRTConversion(_vrtConverterAddress);
    await txResponse.wait();
    console.log(`txResponse to set VRTConverter-Address in XVSVesting is: ${JSON.stringify(txResponse)}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });