import "module-alias/register";

import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import fs from "fs";
import "hardhat-deploy";
import { HardhatUserConfig, extendConfig, task } from "hardhat/config";
import { HardhatConfig } from "hardhat/types";
import "solidity-coverage";
import "solidity-docgen";

require("hardhat-contract-sizer");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

extendConfig((config: HardhatConfig) => {
  if (process.env.EXPORT !== "true") {
    config.external = {
      ...config.external,
      deployments: {
        bsctestnet: [
          "node_modules/@venusprotocol/governance-contracts/deployments/bsctestnet",
          "node_modules/@venusprotocol/venus-protocol/deployments/bsctestnet",
          "node_modules/@venusprotocol/oracle/deployments/bsctestnet",
          "node_modules/@venusprotocol/token-bridge/deployments/bsctestnet",
        ],
        bscmainnet: [
          "node_modules/@venusprotocol/governance-contracts/deployments/bscmainnet",
          "node_modules/@venusprotocol/venus-protocol/deployments/bscmainnet",
          "node_modules/@venusprotocol/oracle/deployments/bscmainnet",
          "node_modules/@venusprotocol/token-bridge/deployments/bscmainnet",
        ],
        sepolia: [
          "node_modules/@venusprotocol/governance-contracts/deployments/sepolia",
          "node_modules/@venusprotocol/oracle/deployments/sepolia",
          "node_modules/@venusprotocol/token-bridge/deployments/sepolia",
        ],
        ethereum: [
          "node_modules/@venusprotocol/token-bridge/deployments/ethereum",
          "node_modules/@venusprotocol/governance-contracts/deployments/ethereum",
          "node_modules/@venusprotocol/oracle/deployments/ethereum",
          "node_modules/@venusprotocol/venus-protocol/deployments/ethereum",
        ],
        opbnbmainnet: [
          "node_modules/@venusprotocol/governance-contracts/deployments/opbnbmainnet",
          "node_modules/@venusprotocol/token-bridge/deployments/opbnbmainnet",
        ],
        arbitrumsepolia: [
          "node_modules/@venusprotocol/governance-contracts/deployments/arbitrumsepolia",
          "node_modules/@venusprotocol/token-bridge/deployments/arbitrumsepolia",
        ],
      },
    };
  }
});

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("run-script", "Runs a hardhard script by name")
  .addParam("path", "Path within script/hardhat to script")
  .setAction(async (taskArgs: { path: string }) => {
    let main;
    try {
      main = require(`./script/hardhat/${taskArgs.path}`);
    } catch (error) {
      console.log("Make sure you pass an existing script path. Available scripts:");
      fs.readdirSync("./script/hardhat", { withFileTypes: true }).forEach((file: fs.Dirent) => {
        // Some directories don't contain files that can be run this way
        if (file.isDirectory() && file.name !== "simulations" && file.name !== "utils" && file.name !== "vips") {
          console.log(`${file.name}/`);
          fs.readdirSync(`./script/hardhat/${file.name}`).forEach((file: string) => {
            console.log(`  ${file}`);
          });
        }
      });
    }

    if (main) {
      await main()
        .then(() => process.exit(0))
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
            runs: 200,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.8.25",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "paris",
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
    ],
  },
  networks: {
    hardhat: isFork(),
    bsctestnet: {
      url: process.env.ARCHIVE_NODE_bsctestnet || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
      gasPrice: 10000000000, // 10 gwei
      gasMultiplier: 10,
      timeout: 12000000,
    },
    bscmainnet: {
      url: process.env.ARCHIVE_NODE_bscmainnet || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    sepolia: {
      url: process.env.ARCHIVE_NODE_sepolia || "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      chainId: 11155111,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    ethereum: {
      url: process.env.ARCHIVE_NODE_ethereum || "https://ethereum.blockpi.network/v1/rpc/public",
      chainId: 1,
      live: true,
      timeout: 1200000, // 20 minutes
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    opbnbtestnet: {
      url: process.env.ARCHIVE_NODE_opbnbtestnet || "https://opbnb-testnet-rpc.bnbchain.org",
      chainId: 5611,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    opbnbmainnet: {
      url: process.env.ARCHIVE_NODE_opbnbmainnet || "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    arbitrumsepolia: {
      url: process.env.ARCHIVE_NODE_arbitrumsepolia || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
    arbitrumone: {
      url: process.env.ARCHIVE_NODE_arbitrumone || "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      live: true,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
    },
  },
  etherscan: {
    apiKey: {
      bscmainnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      bsctestnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      sepolia: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      ethereum: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      opbnbtestnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      opbnbmainnet: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      arbitrumsepolia: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
      arbitrumone: process.env.ETHERSCAN_API_KEY || "ETHERSCAN_API_KEY",
    },
    customChains: [
      {
        network: "bscmainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "bsctestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://sepolia.etherscan.io",
        },
      },
      {
        network: "ethereum",
        chainId: 1,
        urls: {
          apiURL: "https://api.etherscan.io/api",
          browserURL: "https://etherscan.io",
        },
      },
      {
        network: "opbnbtestnet",
        chainId: 5611,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.ETHERSCAN_API_KEY}/op-bnb-testnet/contract/`,
          browserURL: "https://testnet.opbnbscan.com/",
        },
      },
      {
        network: "opbnbmainnet",
        chainId: 204,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.ETHERSCAN_API_KEY}/op-bnb-mainnet/contract/`,
          browserURL: "https://opbnbscan.com/",
        },
      },
      {
        network: "arbitrumsepolia",
        chainId: 421614,
        urls: {
          apiURL: `https://api-sepolia.arbiscan.io/api`,
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
      {
        network: "arbitrumone",
        chainId: 42161,
        urls: {
          apiURL: `https://api.arbiscan.io/api/`,
          browserURL: "https://arbiscan.io/",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./tests/hardhat",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 200000000,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
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
        artifacts: "node_modules/@venusprotocol/governance-contracts/artifacts",
      },
      {
        artifacts: "node_modules/@venusprotocol/oracle/artifacts",
      },
      {
        artifacts: "node_modules/@venusprotocol/protocol-reserve/artifacts",
      },
    ],
    deployments: {},
  },
  docgen: {
    outputDir: "./docgen-docs",
    pages: "files",
    templates: "docgen-templates",
  },
};

function isFork() {
  return process.env.FORK === "true"
    ? {
        allowUnlimitedContractSize: false,
        loggingEnabled: false,
        forking: {
          url:
            process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK}`] ||
            "https://data-seed-prebsc-1-s1.binance.org:8545",
          blockNumber: 21068448,
        },
        accounts: {
          accountsBalance: "1000000000000000000",
        },
        live: false,
      }
    : {
        allowUnlimitedContractSize: true,
        loggingEnabled: false,
        live: false,
      };
}

export default config;
