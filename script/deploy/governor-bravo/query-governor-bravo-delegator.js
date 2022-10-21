const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegatorContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegator",
    governorBravoDelegatorAddress,
  );

  const admin = await governorBravoDelegatorContractInstance.methods.admin().call();
  const implementation = await governorBravoDelegatorContractInstance.methods.implementation().call();

  console.log(`governorBravoDelegatorContract's admin is: ${admin} - implementation is: ${implementation}`);
})();
