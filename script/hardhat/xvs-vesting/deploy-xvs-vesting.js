require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbMantissa } = require('../../deploy/utils/web3-utils');
require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async () => {
    const signers = await ethers.getSigners();
    const deployer = await signers[0].getAddress();
    console.log(`deployer: ${deployer}`);

    const XVSVestingContract = await ethers.getContractFactory("XVSVesting");
    const _xvsAddress = contractConfigData.Contracts.XVS;
    const xvsVestingContractInstance = await XVSVestingContract.deploy(_xvsAddress);
    await xvsVestingContractInstance.deployed();
    console.log(`deployed xvsVesting at address: ${xvsVestingContractInstance.address}`);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });