const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const timelockAddress = contractConfigData.Contracts.Timelock;

  const timelockContractInstance = await saddle.getContractAt("Timelock", timelockAddress);

  const delay = await timelockContractInstance.methods.delay().call();
  const pendingAdmin = await timelockContractInstance.methods.pendingAdmin().call();
  const admin = await timelockContractInstance.methods.admin().call();

  console.log(
    `Timelock ${timelockAddress} has admin: ${admin} - pendingAdmin: ${pendingAdmin} - with a delay (in seconds): ${delay}`,
  );
})();
