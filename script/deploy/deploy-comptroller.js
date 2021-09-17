const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const admin = contractConfigData.admin;
  console.log(`Deploying Comptroller with ${admin}`);
  let deployedComptroller = await saddle.deploy('Comptroller', admin);
  console.log(`Deployed Comptroller to ${deployedComptroller._address}`);
})();
