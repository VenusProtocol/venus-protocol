// FORKING=true npx hardhat run script/hardhat/simulations/nextComptrollerUpgrade.js

const BigNumber = require("bignumber.js");
const { deploy, getContractAt, impersonate, mergeInterface } = require("../utils/misc");
const {
  Contracts: {
    vBNB: vBnbAddress,
    Unitroller: comptrollerProxyAddress,
    VaiUnitroller: vaiControllerProxyAddress,
    Timelock: timelockAddress,
  },
} = require("../../../networks/mainnet.json");

const guy = "0x5C0540deee67Bf6584Ede790D3147E076aEe78cb";

async function VIP1({
  comptrollerProxyContract,
  comptrollerImpl,
  comptrollerLensContract,
  vaiControllerProxyContract,
  vaiControllerImpl,
  timelockAddress,
}) {
  console.log(
    `>>>>>>>>>> Executing the first VIP: Updating comptroller with all the updates, but liquidation interface is kept <<<<<<<<<<`,
  );

  console.log("Setting Pending impl of Unitroller");
  await comptrollerProxyContract.methods._setPendingImplementation(comptrollerImpl._address).send({
    from: timelockAddress,
  });
  console.log("Pending comptroller becomes the impl");
  await comptrollerImpl.methods._become(comptrollerProxyContract._address).send({
    from: timelockAddress,
  });
  console.log("Setting the ComptrollerLens contract address");
  await comptrollerProxyContract.methods._setComptrollerLens(comptrollerLensContract._address).send({
    from: timelockAddress,
  });

  console.log("Setting Pending impl of VAIController");
  await vaiControllerProxyContract.methods._setPendingImplementation(vaiControllerImpl._address).send({
    from: timelockAddress,
  });
  console.log("Pending VAIController becomes the impl");
  await vaiControllerImpl.methods._become(vaiControllerProxyContract._address).send({
    from: timelockAddress,
  });

  console.log("First VIP executed!");
}

async function upgradeNextComptroller() {
  const deployerAddress = "0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D";

  await impersonate(guy);
  await impersonate(deployerAddress);
  await impersonate(timelockAddress);

  //
  console.log(">>>>>>>>>> prepare proxy contracts <<<<<<<<<<");
  const comptrollerProxyContract = getContractAt("Unitroller", comptrollerProxyAddress);
  mergeInterface(comptrollerProxyContract, getContractAt("Comptroller", comptrollerProxyAddress));

  const vaiControllerProxyContract = getContractAt("VAIUnitroller", vaiControllerProxyAddress);
  mergeInterface(vaiControllerProxyContract, getContractAt("VAIController", vaiControllerProxyAddress));

  //
  console.log(">>>>>>>>>> Deploying all necessary contract <<<<<<<<<<");
  console.log("Deploying ComptrollerLens...");
  const comptrollerLensContract = await deploy("ComptrollerLens").send({ from: deployerAddress });
  console.log(`Deployed ComptrollerLens to ${comptrollerLensContract._address}`);

  console.log("Deploying new Comptroller Impl...");
  const comptrollerImpl = await deploy("Comptroller").send({ from: deployerAddress });
  console.log(`Deployed new Comptroller Impl to ${comptrollerImpl._address}`);

  console.log("Deploying new VAIController Impl...");
  const vaiControllerImpl = await deploy("VAIController").send({ from: deployerAddress });
  console.log(`Deployed new VAIController Impl to ${vaiControllerImpl._address}`);

  const treasuryAddress = await comptrollerProxyContract.methods.treasuryAddress().call();
  const adminAddress = await comptrollerProxyContract.methods.admin().call();
  console.log(
    `>>>>>>>>>> Deploying Liquidator, treasury address: ${treasuryAddress}, adminAddress: ${adminAddress} <<<<<<<<<<<`,
  );
  const liquidatorContract = await deploy(
    "Liquidator",
    adminAddress,
    vBnbAddress,
    comptrollerProxyContract._address,
    vaiControllerProxyContract._address,
    treasuryAddress,
    new BigNumber(0.05).times(1e18),
  ).send({ from: deployerAddress });
  console.log(`Deployed Liquidator to ${liquidatorContract._address}`);

  await VIP1({
    comptrollerProxyContract,
    comptrollerImpl,
    comptrollerLensContract,
    vaiControllerProxyContract,
    vaiControllerImpl,
    timelockAddress,
  });
}

upgradeNextComptroller()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
