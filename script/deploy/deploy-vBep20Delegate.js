const contractConfigData = require("../../networks/rinkeby.json");

(async () => {
  const owner = contractConfigData.admin;
  console.log(`Deploying VBep20Delegate with owner: ${owner} `);
  let deployedVBep20Delegate = await saddle.deploy('VBep20Delegate', owner);
  console.log(`Deployed VBep20Delegate to ${deployedVBep20Delegate._address}`);
})();
