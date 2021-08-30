require("@nomiclabs/hardhat-truffle5");

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
    hardhat: {
      forking: {
        //    https://bsc.getblock.io/?api_key=<YOUR-API_KEY>
        url: "https://bsc.getblock.io/?api_key=251db1eb-eb29-48b0-8108-a060efce5b7f"
      }
    }
  },

  paths: {
    tests: "./hardhat-tests",
  },

  mocha: {
    timeout: 80000
  }
};
