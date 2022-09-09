require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async ({ timelockAddress, xvsVaultAddress, guardianAddress }) => {
    const signers = await ethers.getSigners();
    const deployer = await signers[0].getAddress();
    const GovernorAlphaDelegateContract = await ethers.getContractFactory("GovernorAlpha");
    const governorAlpha = await GovernorAlphaDelegateContract.deploy(timelockAddress, xvsVaultAddress, guardianAddress);
    await governorAlpha.deployed();
    console.log(`deployer: ${deployer} deployed GovernorAlphaDelegate at address: ${governorAlpha.address}`);


    const Timelock = await ethers.getContractFactory("Timelock");
    const timelock = await Timelock.attach(
        timelockAddress

    );

    const timelockDelay = await timelock.delay();
    let latestBlock = await ethers.provider.getBlock("latest")
    let eta = latestBlock.timestamp + +timelockDelay + 1000;
    const abi = ethers.utils.defaultAbiCoder;
    const params = abi.encode(
        ["address"], // encode as address array
        [governorAlpha.address]); // array to encode
    await timelock.queueTransaction(timelockAddress, 0, "setPendingAdmin(address)", params, eta);

    await network.provider.send("evm_setNextBlockTimestamp", [eta + 1000])
    await network.provider.send("evm_mine")
    await timelock.executeTransaction(timelockAddress, 0, "setPendingAdmin(address)", params, eta);

    latestBlock = await ethers.provider.getBlock("latest")
    eta = latestBlock.timestamp + +timelockDelay + 1000;
    await timelock.queueTransaction(timelockAddress, 0, "acceptAdmin(address)", params, eta);

    await network.provider.send("evm_setNextBlockTimestamp", [eta + 1000])
    await network.provider.send("evm_mine")
    await timelock.executeTransaction(timelockAddress, 0, "acceptAdmin(address)", params, eta);

    return governorAlpha;
};

module.exports = main;
