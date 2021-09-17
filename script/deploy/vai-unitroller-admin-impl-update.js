const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  //load unitrollerContractInstance from unitrollerAddress
  const vaiUnitrollerAddress = contractConfigData.Contracts.VAIUnitroller;
  const vaiUnitrollerContractInstance = await saddle.getContractAt('VAIUnitroller', vaiUnitrollerAddress);
  const vaiControllerAddress = contractConfigData.Contracts.VAIController;

  //1. _setPendingImplementation on vaiUnitroller to vaiController
  await vaiUnitrollerContractInstance.methods._setPendingImplementation(vaiControllerAddress).send();

  const vaiControllerInstance = await saddle.getContractAt("VAIController", vaiControllerAddress);

  //2. VAIController to admin of viaUnitroller via call _become(VAIUnitroller unitroller) on vaiController
  await vaiControllerInstance.methods._become(vaiUnitrollerAddress).send();

  //3. function _setComptroller(ComptrollerInterface comptroller_) on VAIUnitroller
  await vaiControllerInstance.methods._setComptroller(contractConfigData.Contracts.Comptroller).send();
})();
