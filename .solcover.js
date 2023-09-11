const { execSync } = require("child_process");

module.exports = {
  port: 8555,
  providerOpts: {
    // See example coverage settings at https://github.com/sc-forks/solidity-coverage
    gas: 0xfffffff,
    gasPrice: 0x01,
  },
  mocha: {
    enableTimeouts: false,
    grep: /@gas|@no-cov/,
    invert: true,
  },
  skipFiles: ["test", "oracle"].concat(process.env["SKIP_UNITROLLER"] ? ["Unitroller.sol"] : []),
  istanbulReporter: ["html", "lcov", "text", "json", "cobertura"],
};
