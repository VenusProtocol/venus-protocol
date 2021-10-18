const contractConfigData = require("../../../networks/testnet.json");

(async () => {  

  const timelockAddress = contractConfigData.Contracts.Timelock;

  const timelockContractInstance = await saddle.getContractAt('Timelock', timelockAddress);

  const delay = await timelockContractInstance.methods.delay().call();

  console.log(`delay on Timelock ${timelockAddress} is: ${delay}`);
})();
