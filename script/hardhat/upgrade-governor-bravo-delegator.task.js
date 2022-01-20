const { task, types } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();
const contractConfigData = require(`../../networks/testnet.json`);
const { bnbMantissa } = require('../deploy/utils/web3-utils');

task("upgrade-governor-bravo-delegator", "upgrades implementation of GovernorBravoDelegator contract")
  .setAction(async (args, hre) => {


  });
