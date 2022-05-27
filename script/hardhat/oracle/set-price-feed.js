// npx hardhat run script/hardhat/oracle/deploy-chainlink-oracle.js --network bsctestnet

require('dotenv').config();
const hre = require('hardhat');
const BigNumber = require('bignumber.js');
const { waterfall } = require('../utils/waterfall');
const ethers = hre.ethers;

const {
  Timelock,
  vBNB,
  VaiUnitroller,
  Unitroller,
  VTreasury,
  VenusChainlinkOracle: ourOracleContractAddress // please ensure this is newly deployed contract 
} = require(`../../../networks/${network.name === 'bsctestnet' ? 'testnet' : 'mainnet'}.json`).Contracts;

const oldOracleContractAddress = network.name === 'bsctestnet'
  ? '0x03cf8ff6262363010984b192dc654bd4825caffc'
  : '0xd8b6da2bfec71d684d3e2a2fc9492ddad5c3787f';

function deduplicateEvents(events) {
  const map = {};
  events.forEach((event) => {
    const asset = event.args[0];
    // ideally the events are returned in an ascending block order, but just in case...
    if (map[asset]) {
      if (event.blockNumber >= map[asset].blockNumber) {
        // console.log(`updated: ${asset}, old: ${map[asset].blockNumber} new: ${event.blockNumber}`);
        map[asset] = event;
      }
    } else {
      map[asset] = event;
    }
  });
  return Object.keys(map).map(asset => map[asset]);
}

const main = async () => {
  const signers = await ethers.getSigners();
  const deployer = await signers[0].getAddress();

  // prepare contracts
  console.log(`current venus chainlink oracle contract: ${oldOracleContractAddress}`);
  const oldOracleContract = await ethers.getContractAt('VenusChainlinkOracle', oldOracleContractAddress);

  console.log(`our venus chainlink oracle contract: ${ourOracleContractAddress}`);
  const ourOracleContract = await ethers.getContractAt('VenusChainlinkOracle', ourOracleContractAddress);

  const oldAdmin = await oldOracleContract.functions.admin();
  console.log(`old admin: ${oldAdmin}`);

  const ourAdmin = await ourOracleContract.functions.admin();
  console.log(`our admin: ${ourAdmin}`);


  // fetch all previous price update events and apply all events to new contract
  const pricePostedEvents = await oldOracleContract.queryFilter('PricePosted');
  const feedSetEvents = (await oldOracleContract.queryFilter('FeedSet'));

  const dedupedPricePostedEvents = deduplicateEvents(pricePostedEvents).map(e => e.args);
  const dedupedFeedSetEvents = deduplicateEvents(feedSetEvents).map(e => e.args);

  console.log('feed set events:', dedupedFeedSetEvents.length);
  console.log('price posted events:', dedupedPricePostedEvents.length);

  // apply events
  await waterfall([
    // function setFeed(string calldata symbol, address feed)
    ...(dedupedFeedSetEvents.map(event => {
      return async () => {
        console.log('set feed:', event.feed, event.symbol);
        const tx = await ourOracleContract.setFeed(event.symbol, event.feed);
        await tx.wait();
        console.log('done feed set', event.feed, event.symbol);
      } 
    })),
    // function setDirectPrice(address asset, uint price)
    ...(dedupedPricePostedEvents.map(event => {
      return async () => {
        console.log('set direct price:', event.asset, event.newPriceMantissa.toString());
        const tx = await ourOracleContract.setDirectPrice(event.asset, event.newPriceMantissa);
        await tx.wait();
        console.log('done set direct price', event.asset, event.newPriceMantissa.toString());
      }
    })),
  ])

  console.log('all done!');

};

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });