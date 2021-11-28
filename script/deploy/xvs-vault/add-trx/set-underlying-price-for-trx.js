const [network] = args;
const contractConfigData = require(`../../../../networks/${network}.json`);

(async () => {
  const venusChainlinkOracleAddress = contractConfigData.Contracts.VenusPriceOracle;

  //load venusChainlinkOracleContractInstance from venusChainlinkOracleAddress
  const venusChainlinkOracleContractInstance = await saddle.getContractAt('VenusChainlinkOracle', venusChainlinkOracleAddress);

  await venusChainlinkOracleContractInstance.methods.setUnderlyingPrice(contractConfigData.Contracts.vTRX,
                                                                        contractConfigData.PriceFeed.TRX.defaultPrice).send();
})();
