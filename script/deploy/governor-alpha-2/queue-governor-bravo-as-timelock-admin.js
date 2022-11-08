const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbUnsigned } = require("../utils/web3-utils");

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  const governorBravoAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const delay = bnbUnsigned(600);
  const blockNumber = await saddle.web3.eth.getBlockNumber();
  const block = await saddle.web3.eth.getBlock(blockNumber);
  const timestamp = block.timestamp;
  const eta = bnbUnsigned(timestamp).add(delay).add(120);

  console.log(
    `queueing SetTimelockPendingAdmin with governorBravo: ${governorBravoAddress} - configuredDelay: ${delay},  eta: ${eta}`,
  );

  const queueSetTimelockPendingAdminTxn = await governorAlpha2ContractInstance.methods
    .__queueSetTimelockPendingAdmin(governorBravoAddress, eta)
    .send();

  console.log(`queueSetTimelockPendingAdminTxn is: ${queueSetTimelockPendingAdminTxn.status}`);
})();
