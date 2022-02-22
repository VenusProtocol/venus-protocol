require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
    const xvsVestingAddress = contractConfigData.Contracts.XVSVesting;
    const _xvsAddress = contractConfigData.Contracts.XVS;
    const xvsVestingConstructorArgumentArray = [_xvsAddress];
    console.log(`Verifying XVSVesting with _xvsAddress in constructorArguments: ${xvsVestingConstructorArgumentArray}`);

    await hre.run("verify:verify", {
        address: xvsVestingAddress,
        constructorArguments: xvsVestingConstructorArgumentArray
    });
};

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });