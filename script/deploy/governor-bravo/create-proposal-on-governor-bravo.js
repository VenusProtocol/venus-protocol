const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoDelegateContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoDelegatorAddress);
  const timelockAddress =  contractConfigData.Contracts.Timelock;
  const payload = web3.eth.abi.encodeParameter('address', '0x0000000000000000000000000000000000000000');

  const txn = await governorBravoDelegateContractInstance.methods.propose(
    [timelockAddress],
    [0],
    ['_setPendingAdmin(address)'],
    [payload],
    "test for voting against with reason-82 on GovernorBravoDelegate for _setPendingAdmin to 0x address").send();

  console.log(`GovernorBravoDelegate - proposed ZeroAddress as PendingAdmin for timelock :: with transactionStatus ${txn.status}`);  

})();
