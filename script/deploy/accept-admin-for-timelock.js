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

    const newAdminOfTimelock = contractConfigData.Accounts.TimelockAdmin;

    await saddle.send(timelockContractInstance, 'acceptAdmin', [], {
            from: newAdminOfTimelock
    });

    console.log(`completed acceptAdmin of timelock to: ${newAdminOfTimelock}`);
})();
