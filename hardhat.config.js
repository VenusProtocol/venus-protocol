const { HardhatUserConfig } = require("hardhat/config");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("@nomiclabs/hardhat-etherscan");
require("solidity-coverage");
require("@openzeppelin/hardhat-upgrades");
const ethers = require("ethers");
require("dotenv").config();

require("./script/hardhat/deploy-vrt-converter.task.js")
require("./script/hardhat/verify-vrt-converter.task.js");
require("./script/hardhat/deploy-xvs-vesting.task.js")
require("./script/hardhat/verify-xvs-vesting.task.js")
require("./script/hardhat/deploy-vrt-token.task.js")
require("./script/hardhat/verify-vrt-token.task.js")
require("./script/hardhat/set-vrt-converter-in-xvs-vesting.task.js");
require("./script/hardhat/set-xvs-vesting-in-vrt-converter.task.js");

const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const config = {
  networks: {
    bscTestnet: {
      url: `https://data-seed-prebsc-2-s3.binance.org:8545`,
      chainId: 97,
      accounts: [`0x${DEPLOYER_PRIVATE_KEY}`],
      gasPrice: ethers.utils.parseUnits("10", "gwei").toNumber(),
      gasMultiplier: 10,
      timeout: 12000000,
    }
  },
  etherscan: {
    apiKey: BSCSCAN_API_KEY,
  },
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          },
        }
      },
    ],
    overrides: {
    },
  },
  mocha: {
    timeout: 2000000,
  },
};

module.exports = config;