/**
 * @type import('hardhat/config').HardhatUserConfig
 */
import { HardhatUserConfig } from "hardhat/types";
import '@openzeppelin/hardhat-upgrades';

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-typechain";
import fs from "fs";
import path from "path";
const USER_HOME = process.env.HOME || process.env.USERPROFILE
let data = {
  "PrivateKey": "",
  "InfuraApiKey": "",
  "EtherscanApiKey": "",
};

let filePath = path.join(USER_HOME+'/.hardhat.data.json');
if (fs.existsSync(filePath)) {
  let rawdata = fs.readFileSync(filePath);
  data = JSON.parse(rawdata.toString());
}
filePath = path.join(__dirname, `.hardhat.data.json`);
if (fs.existsSync(filePath)) {
  let rawdata = fs.readFileSync(filePath);
  data = JSON.parse(rawdata.toString());
}

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
          }
        }
      }
    ],
  },
  networks: {
    hardhat: {
      chainId: 97,
      allowUnlimitedContractSize: true
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${data.InfuraApiKey}`,
      accounts: [data.PrivateKey]
    },
    bsctestnet: {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545/`,
      accounts: [data.PrivateKey]
    },
    bscmainnet: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts: [data.PrivateKey]
    },
    hecotestnet: {
      url: `https://http-testnet.hecochain.com`,
      accounts: [data.PrivateKey]
    }
  },
  etherscan: {
    apiKey: data.EtherscanApiKey,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 20000
  }
};

export default config;