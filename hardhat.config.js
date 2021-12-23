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
      chainId: 56,
      forking: {
        url: process.env['BSC_ARCHIVE_NODE']
      }
    }
  },
  mocha: {
    timeout: 8000000
  }
};
