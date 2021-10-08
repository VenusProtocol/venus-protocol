const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const timelockAddress = contractConfigData.Contracts.Timelock;

  //load timelockContractInstance from timelockAddress
  const timelockContractInstance = await saddle.getContractAt('Timelock', timelockAddress);

  //query admin of timelockContractInstance 
  const currentAdminOfTimelock = await timelockContractInstance.methods.admin().call();
  console.log(`currentAdmin of timelock is: ${currentAdminOfTimelock}`);
})();
