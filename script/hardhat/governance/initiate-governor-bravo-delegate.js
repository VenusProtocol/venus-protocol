require("dotenv").config();
const hre = require("hardhat");
const ethers = hre.ethers;

const main = async (taskArgs = { governorBravoDelegateAddress: undefined, governorAlpha2Address: undefined, network: 'testnet' }) => {
  const { network = 'testnet' } = taskArgs;
  let { governorBravoDelegateAddress, governorAlpha2Address } = taskArgs;

  const [root] = await ethers.getSigners();

  const contractConfigData = require(`../../../networks/${network}.json`);
  if (!governorBravoDelegateAddress) {
    governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
  }

  if (!governorAlpha2Address) {
    governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;
  }

  const governorBravoDelegate = await ethers.getContractAt("GovernorBravoDelegate", governorBravoDelegateAddress, root);

  const adminOfGovernanceBravoDelegate = await governorBravoDelegate.admin();
  console.log(`adminOfGovernanceBravoDelegate is: ${adminOfGovernanceBravoDelegate}`);

  console.log(`calling _initiate on GovernorBravoDelegate with argument: ${governorAlpha2Address}`);
  await governorBravoDelegate._initiate(governorAlpha2Address);
};

module.exports = main;
