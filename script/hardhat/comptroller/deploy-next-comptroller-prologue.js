// npx hardhat run script/hardhat/comptroller/deploy-next-comptroller-prologue.js --network bsctestnet

require("dotenv").config();
const hre = require("hardhat");
const BigNumber = require("bignumber.js");
const ethers = hre.ethers;

const contractConfigData = require(`../../../networks/testnet.json`);

const { Timelock, vBNB, VaiUnitroller, Unitroller, VTreasury } = contractConfigData.Contracts;

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();

  // vai controller
  const VAIControllerContract = await ethers.getContractFactory("VAIController");
  const vaiControllerContractInstance = await VAIControllerContract.deploy();
  await vaiControllerContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed VAIController at address: ${vaiControllerContractInstance.address}`);

  //
  const ComptrollerLensContract = await ethers.getContractFactory("ComptrollerLens");
  const comptrollerLensContractInstance = await ComptrollerLensContract.deploy();
  await comptrollerLensContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed ComptrollerLens at address: ${comptrollerLensContractInstance.address}`);

  //
  const ComptrollerContract = await ethers.getContractFactory("Comptroller");
  const comptrollerContractInstance = await ComptrollerContract.deploy();
  await comptrollerContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed Comptroller at address: ${comptrollerContractInstance.address}`);

  //
  const LiquidatorContract = await ethers.getContractFactory("Liquidator");
  const liquidatorArgs = [
    Timelock,
    vBNB,
    Unitroller,
    VaiUnitroller,
    VTreasury,
    new BigNumber(0.05).times(1e18).toFixed(0),
  ];
  const liquidatorContractInstance = await LiquidatorContract.deploy(...liquidatorArgs);
  await liquidatorContractInstance.deployed();
  console.log(`deployer: ${deployer} deployed Liquidator at address: ${liquidatorContractInstance.address}`);
  return {
    vaiControllerContract: vaiControllerContractInstance,
    comptrollerLensContract: comptrollerLensContractInstance,
    comptrollerContract: comptrollerContractInstance,
    liquidatorContract: liquidatorContractInstance,
  };
};

module.exports = main;
