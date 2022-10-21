const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbUnsigned } = require("../utils/web3-utils");

(async () => {
  const governorAlphaAddress = contractConfigData.Contracts.GovernorAlpha;

  const governorAlphaContractInstance = await saddle.getContractAt("GovernorAlpha", governorAlphaAddress);

  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const delay = bnbUnsigned(600);
  const blockNumber = await saddle.web3.eth.getBlockNumber();
  const block = await saddle.web3.eth.getBlock(blockNumber);
  const timestamp = block.timestamp;
  const eta = bnbUnsigned(timestamp).add(delay).add(120);

  console.log(
    `queueing SetTimelockPendingAdmin with governorAlpha2: ${governorAlpha2Address} - configuredDelay: ${delay},  eta: ${eta}`,
  );

  const queueSetTimelockPendingAdminTxn = await governorAlphaContractInstance.methods
    .__queueSetTimelockPendingAdmin(governorAlpha2Address, eta)
    .send();

  console.log(`queueSetTimelockPendingAdminTxn is: ${queueSetTimelockPendingAdminTxn.status}`);
})();
