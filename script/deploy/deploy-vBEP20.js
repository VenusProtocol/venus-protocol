const contractConfigData = require("../../networks/rinkeby.json");
const [ vTokenSymbol, interestRateModel ] = args;

(async () => {

  const vBEP20Config = contractConfigData.Tokens[vTokenSymbol];
  const uscUnderlying = vBEP20Config.underlying;
  const comptrollerInterface = contractConfigData.Contracts.Unitroller;
  const interestRateModelAddress = contractConfigData.Contracts[interestRateModel];
  const initialExchangeRateMantissa = vBEP20Config.initial_exchange_rate_mantissa;
  const name = vBEP20Config.name;
  const symbol = vBEP20Config.symbol;
  const decimals = vBEP20Config.decimals;
  const admin = contractConfigData.Contracts.Timelock;
  const implementation = contractConfigData.Contracts.VBep20Delegate;
  const becomeImplementationData = "0x";

  const constructorArgumentArray = [
    uscUnderlying,
    comptrollerInterface,
    interestRateModelAddress,
    initialExchangeRateMantissa,
    name,
    symbol,
    decimals,
    admin,
    implementation,
    becomeImplementationData
  ];

  const constructorData = web3.eth.abi.encodeParameters(
    ['address', 'address', 'address', 'uint', 'string', 'string', 'uint8', 'address', 'address', 'bytes'],
    constructorArgumentArray
  );

  console.log(`constructor data for ${vTokenSymbol} is: ${constructorData}`);
  
  console.log(`Deploying ${vTokenSymbol} with constructorData: ${JSON.stringify(constructorArgumentArray)} `);

  let deployedVBEP20 = await saddle.deploy('VBep20Delegator', constructorArgumentArray);

  console.log(`Deployed ${vTokenSymbol} to ${deployedVBEP20._address}`);
})();
