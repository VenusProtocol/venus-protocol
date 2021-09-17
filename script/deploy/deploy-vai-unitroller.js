const contractConfigData = require("../../networks/rinkeby.json");

(async () => {

  const vaiAdmin = contractConfigData.admin;
  console.log(`Deploying VAIUnitroller with admin: ${vaiAdmin}`);
  let deployedVAIUnitroller = await saddle.deploy('VAIUnitroller', vaiAdmin);
  const vaiUnitrollerAddress = deployedVAIUnitroller._address;
  console.log(`Deployed VAIUnitroller to ${vaiUnitrollerAddress}`);

})();
