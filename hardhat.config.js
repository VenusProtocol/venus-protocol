require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy-ethers");
require("dotenv").config();
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ethers = require("ethers");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.5.16",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  namedAccounts: {
    deployer: 0,
  },
  networks: {
    bscTestnet: {
      url: process.env['BSC_TESTNET_NODE'],
      chainId: 97,
      accounts: [`0x${DEPLOYER_PRIVATE_KEY}`],
      gasPrice: ethers.utils.parseUnits("50", "gwei").toNumber(),
      gasMultiplier: 10,
      timeout: 12000000,
    },
    hardhat: {
      chainId: 56,
      forking: {
        url: process.env['BSC_ARCHIVE_NODE']
      }
    }
  },
  etherscan: {
    apiKey: BSCSCAN_API_KEY,
  },
  mocha: {
    timeout: 8000000
  }
};
