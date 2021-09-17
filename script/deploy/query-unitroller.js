const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const unitrollerAddress = contractConfigData.Contracts.Unitroller;
  const unitrollerContractInstance = await saddle.getContractAt('Unitroller', unitrollerAddress);
  const unitrollerAdmin = await unitrollerContractInstance.methods.admin().call();
  console.log(`unitrollerAdmin is: ${unitrollerAdmin}`);
})();
