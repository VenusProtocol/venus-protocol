require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
    const venusLensAddress = contractConfigData.Contracts.VenusLens;
    const comptrollerAddress = contractConfigData.Contracts.Unitroller;
    const venusLensInstance = await ethers.getContractAt("VenusLens", venusLensAddress);
    const dailyXVS = await venusLensInstance.getDailyXVS("0x0D29D962Ce3ECc34B41E2885fb0296a1C2fD80fd", comptrollerAddress);
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });