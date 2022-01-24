const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);

task("deploy-xvs-vesting", "deploys XVSVesting contract")
    .setAction(async (args, hre) => {
        const XVSVestingContract = await hre.ethers.getContractFactory(`contracts/VRT/XVSVesting.sol:XVSVesting`);
        const _xvsAddress = contractConfigData.Contracts.XVS;
        const xvsVestingContractInstance = await XVSVestingContract.deploy(_xvsAddress);
        await xvsVestingContractInstance.deployed();
        console.log(`deployed xvsVesting at address: ${xvsVestingContractInstance.address}`);
    });