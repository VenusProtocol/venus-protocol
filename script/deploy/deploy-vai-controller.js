const contractConfigData = require("../../networks/rinkeby.json");

(async () => {

  const vaiAdmin = contractConfigData.admin;
  console.log(`Deploying VAIController with admin: ${vaiAdmin}`);
  let deployedVAIController = await saddle.deploy('VAIController', vaiAdmin);
  const vaiControllerAddress = deployedVAIController._address;
  console.log(`Deployed VAIUnitroller to ${vaiControllerAddress}`);

  //load vaiController Contract Instance
  const vaiControllerContractInstance = await saddle.getContractAt('VAIController', vaiControllerAddress);

  //set comptroller in vaiController
  await vaiControllerContractInstance.methods._setComptroller(contractConfigData.Contracts.Comptroller).send();

  //load unitrollerContractInstance from unitrollerAddress
  const vaiUnitrollerContractInstance = await saddle.getContractAt('VAIUnitroller', contractConfigData.Contracts.VAIUnitroller);
  const vaiUnitrollerAdmin = await vaiUnitrollerContractInstance.methods.admin().call();
  console.log(`vaiUnitrollerAdmin is: ${vaiUnitrollerAdmin}`);

  //accept comptroller in vaiController  
  await saddle.send(vaiControllerContractInstance, '_become', [contractConfigData.Contracts.VAIUnitroller], {
    from: vaiUnitrollerAdmin
  });

  console.log(`comptroller: ${contractConfigData.Contracts.Comptroller} was accepted as admin to vaiController: ${vaiControllerAddress}`);
})();
