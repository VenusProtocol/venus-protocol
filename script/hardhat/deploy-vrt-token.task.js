const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);

task("deploy-vrt-token", "deploys VRT Token contract")
    .setAction(async (args, hre) => {
        const VRTContract = await hre.ethers.getContractFactory(`contracts/VRT/VRT.sol:VRT`);
        const tokenAdmin = contractConfigData.Accounts.admin;
        const vrtContractInstance = await VRTContract.deploy(tokenAdmin);
        await vrtContractInstance.deployed();
        console.log(`deployed VRT at address: ${vrtContractInstance.address}`);
    });