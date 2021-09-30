const contractConfigData = require("../../networks/rinkeby.json");

const {
  bnbUnsigned,
  encodeParameters,
  sleep
} = require('./utils/web3-utils');


(async () => {
    const timelockAddress = contractConfigData.Contracts.Timelock;

    //load timelockContractInstance from timelockAddress
    const timelockContractInstance = await saddle.getContractAt('Timelock', timelockAddress);

    //query admin of timelockContractInstance 
    const currentAdminOfTimelock = await timelockContractInstance.methods.admin().call();
    console.log(`currentAdmin of timelock is: ${currentAdminOfTimelock}`);

    const newAdminOfTimelock = contractConfigData.Accounts.TimelockAdmin;

    //queuing timelock's admin update transaction

  let value = bnbUnsigned(0);
  const signature_queueTxn = 'setPendingAdmin(address)';
  const data_queueTxn = encodeParameters(['address'], [newAdminOfTimelock]);

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
  await saddle.send(timelockContractInstance, 'queueTransaction', [timelockAddress, value, signature_queueTxn, data_queueTxn, eta], {
          from: currentAdminOfTimelock
  });

  console.log(`completed queuing of setPendingAdmin(address) of Timelock to: ${newAdminOfTimelock}`);

  await sleep(180000);

  console.log(`slept for 180 seconds after _acceptAdmin of unitroller to: ${newAdminOfTimelock}`);

  const blockNumber_AfterSleep = await saddle.web3.eth.getBlockNumber();
  const block_AfterSleep = await saddle.web3.eth.getBlock(blockNumber_AfterSleep);
  const timestamp_AfterSleep = block_AfterSleep.timestamp;
  console.log(`after sleep: currentBlockNumber: ${blockNumber_AfterSleep} - currentBlockTimeStamp: ${timestamp_AfterSleep} - eta: ${eta}`);

  const signature_executeTxn = 'setPendingAdmin(address)';
  const data_executeTxn = encodeParameters(['address'], [newAdminOfTimelock]);

  //6. executeTransaction (setPendingAdmin(address))
  await saddle.send(timelockContractInstance, 'executeTransaction', [timelockAddress, value, signature_executeTxn, data_executeTxn, eta], {
    from: currentAdminOfTimelock
  });

  console.log(`executed queued-Transaction of setPendingAdmin(address) of Timelock to: ${newAdminOfTimelock}`);
})();
