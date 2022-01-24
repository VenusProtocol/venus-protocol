const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-vrt-converter", "verifies deployed VRTConverter contract")
  .setAction(async (args, hre) => {

   const vrtConverterAddress = contractConfigData.Contracts.VRTConverter;

   const _vrtAddress = contractConfigData.Contracts.VRT;
   const _xvsAddress = contractConfigData.Contracts.XVS;
   const _xvsVestingAddress = contractConfigData.Contracts.XVSVesting;
   const _conversionRatio = new BigNumber(0.75e18);
   const _conversionStartTime = 1643044516;
   const _vrtTotalSupply = bnbMantissa(2000000000);

    const vrtConverterConstructorArgumentArray = [_vrtAddress, _xvsAddress, _xvsVestingAddress, _conversionRatio, _conversionStartTime, _vrtTotalSupply];
    console.log(`Verifying VRTConverter with _vrtAddress, _xvsAddress, _xvsVestingAddress, _conversionRatio, _conversionStartTime, _vrtTotalSupply in constructorArguments: ${vrtConverterConstructorArgumentArray}`);

    await hre.run("verify:verify", {
       address: vrtConverterAddress,
       constructorArguments: vrtConverterConstructorArgumentArray
     });
});