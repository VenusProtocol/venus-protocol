const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const guardian = contractConfigData.Accounts.Guardian;
  console.log(`Deploying GovernorBravoDelegate by admin: ${guardian}`);
  let deployedGovernorBravoDelegate = await saddle.deploy("GovernorBravoDelegate");
  console.log(`Deployed GovernorBravoDelegate to ${deployedGovernorBravoDelegate._address} by admin: ${guardian}`);
})();
