const contractConfigData = require("../../networks/rinkeby.json");

(async () => {

  const vaiAdmin = contractConfigData.Contracts.Timelock;
  console.log(`Deploying VAI with admin: ${vaiAdmin}`);
  let deployedVAI = await saddle.deploy('VAI', [contractConfigData.chainId], vaiAdmin);
  const vaiAddress = deployedVAI._address;
  console.log(`Deployed VAI to ${vaiAddress}`);

})();
