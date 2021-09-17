const contractConfigData = require("../../networks/rinkeby.json");
const [ interestRateModel ] = args;

(async () => {
  const constructorArgumentObject = contractConfigData.InterestRateModel[interestRateModel];
  
  const constructorArgumentArray = [constructorArgumentObject.base,
                                    constructorArgumentObject.slope, 
                                    constructorArgumentObject.jump,
                                    constructorArgumentObject.kink];

  const constructorData = web3.eth.abi.encodeParameters(
    ['uint', 'uint', 'uint', 'uint'],
    constructorArgumentArray
  );

  console.log(`Deploying JumpRateModel with constructor Arguments: ${JSON.stringify(constructorArgumentArray)}`);

  console.log(`constructor data for JumpRateModel is: ${constructorData}`);

  let deployedJumpRateModel = await saddle.deploy('JumpRateModel', constructorArgumentArray);

  console.log(`Deployed JumpRateModel to ${deployedJumpRateModel._address}`);
})();
