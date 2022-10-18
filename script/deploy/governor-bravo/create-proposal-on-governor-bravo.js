const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoDelegateContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegate",
    governorBravoDelegatorAddress,
  );
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const payload = web3.eth.abi.encodeParameter("address", "0xeaa5498d8F0a511495fdD7E97d273aA63cf147F9");

  const txn = await governorBravoDelegateContractInstance.methods
    .propose(
      [timelockAddress],
      [0],
      ["setPendingAdmin(address)"],
      [payload],
      "make new governorBravoDelegatorAddress as pendingAdmin on GovernorBravoDelegate",
    )
    .send();

  console.log(
    `GovernorBravoDelegate - proposed new Delegator as PendingAdmin for timelock :: with transactionStatus ${txn.status}`,
  );
})();
