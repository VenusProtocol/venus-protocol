require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async ({ governorBravoDelegateAddress }) => {
  const [root] = await ethers.getSigners();
  // Set timelock as admin to xvs store
  const TimelockContract = await ethers.getContractFactory('Timelock');
  const timelock = await TimelockContract.deploy(root.address, 86400 * 2);
  timelock.setPendingAdmin(root);
  return timelock;
};

module.exports = main;

