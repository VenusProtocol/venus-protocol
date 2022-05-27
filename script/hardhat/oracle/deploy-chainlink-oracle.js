// npx hardhat run script/hardhat/oracle/deploy-chainlink-oracle.js --network bsctestnet

require('dotenv').config();
const hre = require('hardhat');
const BigNumber = require('bignumber.js');
const ethers = hre.ethers;


const contractConfigData = require(`../../../networks/${network.name === 'bsctestnet' ? 'testnet' : 'mainnet'}.json`);

const {
  VTreasury,
  VenusChainlinkOracle: currentOracleContractAddress
} = contractConfigData.Contracts;

  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();

  // deploy oracle contract
  const VenusChainlinkOracleContract = await ethers.getContractFactory("VenusChainlinkOracle");
  const venusChainlinkOracleInstance = await VenusChainlinkOracleContract.deploy(15 * 60);
  await venusChainlinkOracleInstance.deployed();
  console.log(`deployer: ${deployer} deployed VenusChainlinkOracle at address: ${venusChainlinkOracleInstance.address}`);
};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });