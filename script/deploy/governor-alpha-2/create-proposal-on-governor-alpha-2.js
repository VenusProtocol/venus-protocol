const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const payload = web3.eth.abi.encodeParameter("address", "0x0000000000000000000000000000000000000000");

  const txn = await governorAlpha2ContractInstance.methods
    .propose(
      [timelockAddress],
      [0],
      ["_setPendingAdmin(address)"],
      [payload],
      "test on governorAlpha2 for _setPendingAdmin to 0x address ",
    )
    .send();

  console.log(
    `GovernorAlpha2 - proposed ZeroAddress as PendingAdmin for timelock :: with transactionStatus ${txn.status}`,
  );
})();
