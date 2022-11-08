const [network] = args;
const contractConfigData = require(`../../../../networks/${network}.json`);

(async () => {
  const venusChainlinkOracleAddress = contractConfigData.Contracts.VenusPriceOracle;

  //load venusChainlinkOracleContractInstance from venusChainlinkOracleAddress
  const venusChainlinkOracleContractInstance = await saddle.getContractAt(
    "VenusChainlinkOracle",
    venusChainlinkOracleAddress,
  );

  await venusChainlinkOracleContractInstance.methods
    .setUnderlyingPrice(contractConfigData.Contracts.vTRX, 1000000000000000000n)
    .send();
})();
