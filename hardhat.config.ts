import { HardhatUserConfig, task } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import { ethers } from "ethers";
import fs from 'fs';

require("dotenv").config();

const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

task("run-script", "Runs a hardhard script by name")
  .addParam("path", "Path within script/hardhat to script")
  .setAction(async (taskArgs: { path: string }) => {
    let main
    try {
      main = require(`./script/hardhat/${taskArgs.path}`);
    } catch (error) {
      console.log('Make sure you pass an existing script path. Available scripts:')
      fs.readdirSync('./script/hardhat', { withFileTypes: true }).forEach((file: fs.Dirent) => {
        // Some directories don't contain files that can be run this way
        if (file.isDirectory() && file.name !== 'simulations' && file.name !== 'utils' && file.name !== 'vips') {
          console.log(`${file.name}/`)
          fs.readdirSync(`./script/hardhat/${file.name}`).forEach((file: string) => {
            console.log(`  ${file}`);
          })
        }
      });
    }

    if (main) {
      await main().then(() => process.exit(0))
        .catch((error: Error) => {
          console.error(error);
          process.exit(1);
        });
    }
  });

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"]
            }
          }
        }
      }
    ],
  },
  networks: {
    bsctestnet: {
      url: process.env.BSC_TESTNET_NODE || 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
      gasPrice: ethers.utils.parseUnits("10", "gwei").toNumber(),
      gasMultiplier: 10,
      timeout: 12000000,
    },
    hardhat:
     (() => {
      if (process.env.BSC_ARCHIVE_NODE) {
        return {
          chainId: 56,
          forking: {
            url: process.env.BSC_ARCHIVE_NODE || '',
          },
          allowUnlimitedContractSize: true
        };
      }
      return {allowUnlimitedContractSize: true};
    })(),
    // currently not used, we are still using saddle to deploy contracts
    bscmainnet: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : []
    },
  },
  etherscan: {
    apiKey: BSCSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./tests/hardhat",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 20000
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5',
  },
  // Hardhat deploy
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/@venusprotocol/isolated-pools/artifacts",
      }
    ],
  }
};

export default config;
