// npx hardhat run script/hardhat/comptroller/deploy-next-comptroller-prologue.js --network bsctestnet

require("dotenv").config();
const hre = require("hardhat");
const BigNumber = require("bignumber.js");

const contractConfigData = require(`../../../networks/testnet.json`);

const {
  Timelock,
  vBNB,
  VaiUnitroller,
  Unitroller,
  VTreasury,
  ComptrollerLens,
  Comptroller,
  Liquidator,
  VaiController,
} = contractConfigData.Contracts;

const main = async () => {
  //
  await hre.run("verify:verify", {
    address: VaiController,
  });
  console.log(`VaiController verified!`);

  //
  await hre.run("verify:verify", {
    address: Comptroller,
  });
  console.log(`Comptroller verified!`);

  //
  await hre.run("verify:verify", {
    address: ComptrollerLens,
  });
  console.log(`ComptrollerLensContract verified!`);

  //
  const liquidatorArgs = [
    Timelock,
    vBNB,
    Unitroller,
    VaiUnitroller,
    VTreasury,
    new BigNumber(0.05).times(1e18).toFixed(0),
  ];
  await hre.run("verify:verify", {
    address: Liquidator,
    constructorArguments: liquidatorArgs,
  });
  console.log(`LiquidatorContract verified!`);
};

module.exports = main;
