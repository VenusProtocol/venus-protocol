const contractConfigData = require("../../networks/rinkeby.json");

const {
  bnbUnsigned,
  encodeParameters
} = require('./utils/web3-utils');

(async () => {
    const timelockAddress = contractConfigData.Contracts.Timelock;

    //load timelockContractInstance from timelockAddress
    const timelockContractInstance = await saddle.getContractAt('Timelock', timelockAddress);

    //query admin of timelockContractInstance
    const currentAdminOfTimelock = await timelockContractInstance.methods.admin().call();
    console.log(`currentAdmin of timelock is: ${currentAdminOfTimelock}`);

    //queuing timelock's admin update transaction

    let value = bnbUnsigned(0);
    const signature = 'setPendingAdmin(address)';
    const timelockNewAdmin = contractConfigData.Contracts.GovernorAlpha;
    const data = encodeParameters(['address'], [timelockNewAdmin]);

    const configuredDelay = await timelockContractInstance.methods.delay().call(); 
    delay = bnbUnsigned(configuredDelay);

    const blockNumber = await saddle.web3.eth.getBlockNumber();
    const block = await saddle.web3.eth.getBlock(blockNumber);
    const timestamp = block.timestamp;
    const eta = bnbUnsigned(timestamp).add(delay).add(120);

    await saddle.send(timelockContractInstance, 'executeTransaction', [timelockAddress, value, signature, data, eta], {
            from: currentAdminOfTimelock
    });

    console.log(`completed executeTransaction of timelock to: ${timelockNewAdmin}`);
})();
