const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const venusChainlinkOracleAddress = contractConfigData.Contracts.PriceOracle;

  //load venusChainlinkOracleContractInstance from venusChainlinkOracleAddress
  const venusChainlinkOracleContractInstance = await saddle.getContractAt('VenusChainlinkOracle', venusChainlinkOracleAddress);

  const chainlinkOracleAddress = contractConfigData.Contracts.ChainlinkOracle;

  await venusChainlinkOracleContractInstance.methods.setFeed(contractConfigData.Contracts.DAI.toString(),
                                                             contractConfigData.PriceOracle.DAI.chainlinkFeed).send();

  await venusChainlinkOracleContractInstance.methods.setFeed(contractConfigData.Contracts.REP.toString(),
                                                             contractConfigData.PriceOracle.REP.chainlinkFeed).send();

  await venusChainlinkOracleContractInstance.methods.setFeed(contractConfigData.Contracts.ZRX.toString(),
                                                             contractConfigData.PriceOracle.ZRX.chainlinkFeed).send();

  await venusChainlinkOracleContractInstance.methods.setFeed(contractConfigData.Contracts.USDC.toString(),
                                                             contractConfigData.PriceOracle.USDC.chainlinkFeed).send();

  await venusChainlinkOracleContractInstance.methods.setFeed(contractConfigData.Contracts.BAT.toString(),
                                                             contractConfigData.PriceOracle.BAT.chainlinkFeed).send();

  await venusChainlinkOracleContractInstance.methods.setFeed(contractConfigData.Contracts.BNB.toString(),
                                                             contractConfigData.PriceOracle.BNB.chainlinkFeed).send();

  await venusChainlinkOracleContractInstance.methods.setUnderlyingPrice(contractConfigData.Contracts.vUSDT,
                                                                        contractConfigData.PriceOracle.USDT.defaultPrice).send();

  await venusChainlinkOracleContractInstance.methods.setUnderlyingPrice(contractConfigData.Contracts.vWBTC,
                                                                        contractConfigData.PriceOracle.WBTC.defaultPrice).send();
})();
