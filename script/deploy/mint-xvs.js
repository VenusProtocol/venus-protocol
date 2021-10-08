const contractConfigData = require("../../networks/rinkeby.json");
const BigNumber = require('bignumber.js');

(async () => {
  const admin = contractConfigData.admin;
  const xvsAddress = contractConfigData.Tokens.XVS.address;
  const xvsContractInstance = await saddle.getContractAt('XVS', xvsAddress);
  await xvsContractInstance.methods.transfer(contractConfigData.Accounts.TimelockAdmin, new BigNumber(300000e18)).send({from: admin});
})();
