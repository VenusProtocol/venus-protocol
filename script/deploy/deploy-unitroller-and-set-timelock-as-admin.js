const contractConfigData = require("../../networks/rinkeby.json");
const {
  bnbUnsigned,
  sleep
} = require('./utils/web3-utils');

(async () => {
  const unitrollerAdmin = contractConfigData.admin;
  console.log(`Deploying Unitroller with admin: ${unitrollerAdmin}`);
  let deployedUnitroller = await saddle.deploy('Unitroller', unitrollerAdmin);
  const unitrollerAddress = deployedUnitroller._address;
  console.log(`Deployed Unitroller to ${unitrollerAddress}`);

  //load unitrollerContractInstance from unitrollerAddress
  const unitrollerContractInstance = await saddle.getContractAt('Unitroller', unitrollerAddress);

  const comptrollerAddress = contractConfigData.Contracts.Comptroller;
  const comptrollerInstance = await saddle.getContractAt("Comptroller", comptrollerAddress);

  //1. _setPendingImplementation on Unitroller to Comptroller
  await unitrollerContractInstance.methods._setPendingImplementation(comptrollerAddress).send();

  //2. call Comptroller._become  [from: deployer address]
  await comptrollerInstance.methods._become(unitrollerAddress).send();

  const unitrollerNewAdmin = contractConfigData.Contracts.Timelock;
  
  //3. setPendingAdmin(address newPendingAdmin) : newPendingAdmin = timelockAddress
  await unitrollerContractInstance.methods._setPendingAdmin(unitrollerNewAdmin).send();

  //4. Timelock.queueTransaction [ selector: Unitroller._acceptAdmin ] [target: unitroller]
  const timelockAddress = contractConfigData.Contracts.Timelock;

  //load timelockContractInstance from timelockAddress
  const timelockContractInstance = await saddle.getContractAt('Timelock', timelockAddress);

  //queuing timelock's admin update transaction

  let value = bnbUnsigned(0);
  const signature_queueTxn = '_acceptAdmin()';
  const data_queueTxn = "0x0";

  //compute eta
  const configuredDelay = await timelockContractInstance.methods.delay().call(); 
  const delay = bnbUnsigned(configuredDelay);
  const blockNumber = await saddle.web3.eth.getBlockNumber();
  const block = await saddle.web3.eth.getBlock(blockNumber);
  const timestamp = block.timestamp;
  const eta = bnbUnsigned(timestamp).add(delay).add(120);
  console.log(`configuredDelay: ${configuredDelay} - delay: ${delay}`);
  console.log(`before sleep: currentBlockNumber: ${blockNumber} - currentBlockTimeStamp: ${timestamp} - eta: ${eta}`);

  //5. queueTransaction (_acceptAdmin(address))
  await saddle.send(timelockContractInstance, 'queueTransaction', [unitrollerAddress, value, signature_queueTxn, data_queueTxn, eta], {
          from: unitrollerAdmin
  });

  console.log(`completed queuing of _acceptAdmin of unitroller to: ${unitrollerNewAdmin}`);

  await sleep(180000);

  console.log(`slept for 180 seconds after _acceptAdmin of unitroller to: ${unitrollerNewAdmin}`);

  const blockNumber_AfterSleep = await saddle.web3.eth.getBlockNumber();
  const block_AfterSleep = await saddle.web3.eth.getBlock(blockNumber_AfterSleep);
  const timestamp_AfterSleep = block_AfterSleep.timestamp;
  console.log(`after sleep: currentBlockNumber: ${blockNumber_AfterSleep} - currentBlockTimeStamp: ${timestamp_AfterSleep} - eta: ${eta}`);

  const signature_executeTxn = '_acceptAdmin()';
  const data_executeTxn = "0x0";

  //6. executeTransaction (_acceptAdmin(address))
  await saddle.send(timelockContractInstance, 'executeTransaction', [unitrollerAddress, value, signature_executeTxn, data_executeTxn, eta], {
    from: unitrollerAdmin
  });

  console.log(`executed queued-Transaction of _acceptAdmin of unitroller to: ${unitrollerNewAdmin}`);
})();
