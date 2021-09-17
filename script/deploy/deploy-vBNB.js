const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const comptrollerAddress = contractConfigData.Contracts.Comptroller;
  const admin = contractConfigData.Contracts.Timelock;

  const vBNBConfig = contractConfigData.Tokens.vBNB;
  const interestRateModelAddress = contractConfigData.Contracts.Base0bps_Slope2000bps_Jump20000bps_Kink90; //use JumpRateModel Address
  const initialExchangeRateMantissa = vBNBConfig.initial_exchange_rate_mantissa;
  const name = vBNBConfig.name;
  const symbol = vBNBConfig.symbol;
  const decimals = vBNBConfig.decimals;

  const constructorArgumentArray = [comptrollerAddress,
    interestRateModelAddress,
    initialExchangeRateMantissa,
    name,
    symbol,
    decimals,
    admin];

  const constructorData = web3.eth.abi.encodeParameters(
    ['address', 'address', 'uint', 'string', 'string', 'uint8', 'address'],
    constructorArgumentArray
  );

  console.log(`constructor data for vBNB is: ${constructorData}`);
  
  console.log(`Deploying vBNB with owner: ${admin} `);
  
  let deployedVBNB = await saddle.deploy('VBNB', constructorArgumentArray);

  console.log(`Deployed vBNB to ${deployedVBNB._address}`);
})();
