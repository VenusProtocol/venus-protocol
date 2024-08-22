import "module-alias/register";

import "@matterlabs/hardhat-zksync";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-dependency-compiler";
import "hardhat-deploy";
import { HardhatUserConfig, extendConfig } from "hardhat/config";
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
        zksyncsepolia: [
          "node_modules/@venusprotocol/governance-contracts/deployments/zksyncsepolia",
          "node_modules/@venusprotocol/oracle/deployments/zksyncsepolia",
          "node_modules/@venusprotocol/token-bridge/deployments/zksyncsepolia",
        ],

        zksyncmainnet: [
          "node_modules/@venusprotocol/governance-contracts/deployments/zksyncmainnet",
          "node_modules/@venusprotocol/oracle/deployments/zksyncmainnet",
          "node_modules/@venusprotocol/token-bridge/deployments/zksyncmainnet",
        ],
      },
    };
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
            runs: 10000,
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
  zksolc: {
    version: "1.5.0",
    settings: {},
  },
  networks: {
    hardhat: isFork(),
    zksyncsepolia: {
      url: process.env.ARCHIVE_NODE_zksyncsepolia || "https://sepolia.era.zksync.dev",
      ethNetwork: "sepolia",
      verifyURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
      zksync: true,
      live: true,
    },
    zksyncmainnet: {
      url: process.env.ARCHIVE_NODE_zksyncmainnet || "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      verifyURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
      zksync: true,
      live: true,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests/hardhat",
    cache: "./cache-zk",
    artifacts: "./artifacts-zk",
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
        artifacts: "node_modules/@venusprotocol/governance-contracts/artifacts-zk",
      },
      {
        artifacts: "node_modules/@venusprotocol/oracle/artifacts-zk",
      },
      {
        artifacts: "node_modules/@venusprotocol/protocol-reserve/artifacts-zk",
      },
    ],
    deployments: {},
  },
  dependencyCompiler: {
    paths: [
      "hardhat-deploy/solc_0.8/proxy/OptimizedTransparentUpgradeableProxy.sol",
      "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol",
    ],
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
          url: process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK}`] || "https://sepolia.era.zksync.dev",
          blockNumber: 40392000,
        },
        accounts: {
          accountsBalance: "1000000000000000000",
        },
        live: false,
        zksync: true,
      }
    : {
        allowUnlimitedContractSize: true,
        loggingEnabled: false,
        live: false,
        zksync: true,
      };
}

export default config;
