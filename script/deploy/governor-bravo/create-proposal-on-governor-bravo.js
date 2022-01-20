const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoDelegateContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoDelegatorAddress);
  const timelockAddress =  contractConfigData.Contracts.Timelock;
  const payload = web3.eth.abi.encodeParameter('address', '0x5573422A1a59385C247ec3a66B93B7C08eC2f8f2');

  const txn = await governorBravoDelegateContractInstance.methods.propose(
    [timelockAddress],
    [0],
    ['setPendingAdmin(address)'],
    [payload],
    "make new governorBravoDelegatorAddress as pendingAdmin on GovernorBravoDelegate").send();

  console.log(`GovernorBravoDelegate - proposed new Delegator as PendingAdmin for timelock :: with transactionStatus ${txn.status}`);  

})();
