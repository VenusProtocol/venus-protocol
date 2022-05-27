// npx hardhat run script/hardhat/oracle/verify-chainlink-oracle.js --network bsctestnet

require('dotenv').config();
const hre = require('hardhat');
const BigNumber = require('bignumber.js');
const ethers = hre.ethers;

const contractConfigData = require(`../../../networks/testnet.json`);

const {
    VenusChainlinkOracle
} = contractConfigData.Contracts;

const main = async() => {
    //
    await hre.run("verify:verify", {
        address: VenusChainlinkOracle,
        constructorArguments: ['900'],
    });
    console.log(`VenusChainlinkOracle verified!`);
};

main().then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});