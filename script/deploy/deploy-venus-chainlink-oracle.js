
(async () => {
  let deployedVenusChainlinkOracle = await saddle.deploy('VenusChainlinkOracle');
  console.log(`Deployed VenusChainlinkOracle to ${deployedVenusChainlinkOracle._address}`);
})();
