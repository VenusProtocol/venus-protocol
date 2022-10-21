// FORKING=true npx hardhat run script/hardhat/simulations/claimVenus.js

const { web3 } = require("hardhat");
const BigNumber = require("bignumber.js");
const { getContractAt, impersonate, mergeInterface } = require("../utils/misc");
const {
  Contracts: { Unitroller: comptrollerProxyAddress, VenusLens: venusLensAddress, XVS: xvsAddress },
} = require("../../../networks/mainnet.json");

// some testers
const bob = "0xd01119D0D32c8E943681D1f4688a14FE15AA35Bd";
const danny = "0x00509504178541edf8ea084d7095d9c46bf7c881";
const coco = "0x005b7f9127ac18c8da124bb0f58bffaa1952c983";
const dummy = "0xb3e7fa024c62218151552bc2397d6fb3ee855abc";

async function claimVenus() {
  await impersonate(bob);
  await impersonate(danny);
  await impersonate(coco);
  await impersonate(dummy);

  //
  console.log(">>>>>>>>>> prepare proxy contracts <<<<<<<<<<");
  const comptrollerProxyContract = getContractAt("Unitroller", comptrollerProxyAddress);
  mergeInterface(comptrollerProxyContract, getContractAt("Comptroller", comptrollerProxyAddress));

  const xvsToken = getContractAt("VToken", xvsAddress);
  const venusLensContract = getContractAt("VenusLens", venusLensAddress);

  console.log(`block number:`, await web3.eth.getBlockNumber());

  const target = dummy; // change this target
  const expectedVenusReward = await venusLensContract.methods.pendingVenus(target, comptrollerProxyAddress).call();
  console.log(`expected venus reward:`, expectedVenusReward);

  // simulating how many venus they are gonna get in real world
  const beforeVenusBalance = await xvsToken.methods.balanceOf(target).call();
  console.log(`claiming reward for: ${target}, before balance:`, beforeVenusBalance);
  await comptrollerProxyContract.methods.claimVenus(target).send({ from: target });
  const afterVenusBalance = await xvsToken.methods.balanceOf(target).call();
  console.log(
    `${target}, after balance: ${afterVenusBalance}, claimed: ${(
      new BigNumber(afterVenusBalance) - new BigNumber(beforeVenusBalance)
    ).toFixed(0)}`,
  );
}

claimVenus()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
