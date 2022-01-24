const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require("../../networks/testnet.json");

task("verify-xvs-vesting", "verifies deployed XVSVesting contract")
  .setAction(async (args, hre) => {
    const xvsVestingAddress = contractConfigData.Contracts.XVSVesting;
    const _xvsAddress = contractConfigData.Contracts.XVS;
    const xvsVestingConstructorArgumentArray = [_xvsAddress];
    console.log(`Verifying XVSVesting with _xvsAddress in constructorArguments: ${xvsVestingConstructorArgumentArray}`);
    await hre.run("verify:verify", {
      address: xvsVestingAddress,
      constructorArguments: xvsVestingConstructorArgumentArray
    });
  });