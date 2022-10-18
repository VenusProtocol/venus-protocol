require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
const network = process.env.NETWORK;
const contractConfigData = require(`../../../networks/${network}.json`);
const hre = require("hardhat");

const main = async () => {
  const snapshotLens = contractConfigData.Contracts.SnapshotLens;
  await hre.run("verify:verify", {
    address: snapshotLens,
  });
};

module.exports = main;
