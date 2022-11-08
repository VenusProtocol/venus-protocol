// FORKING=true npx hardhat run script/hardhat/simulations/vaultUpgrade.js

const { expect } = require("hardhat");
const { deploy, getContractAt, impersonate } = require("../utils/misc");

async function upgradeVault() {
  const deployer = "0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D";
  const proxyAddress = "0x051100480289e704d20e9db4804837068f3f9204";
  const multisig = "0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B";
  const team = "0xe8833153aE9171452855D391A1653766b70bdCcF";
  const guy = "0x5C0540deee67Bf6584Ede790D3147E076aEe78cb";

  await impersonate(deployer);
  await impersonate(multisig);
  await impersonate(team);

  console.log("Deploying XVSVault...");
  const vaultImpl = await deploy("XVSVault").send({ from: deployer });
  console.log(`Deployed XVSVault to ${vaultImpl._address}`);

  const proxy = getContractAt("XVSVaultProxy", proxyAddress);
  await proxy.methods._setPendingImplementation(vaultImpl._address).send({ from: multisig });
  console.log("Pending impl updated");

  console.log("Accepting impl");
  await vaultImpl.methods._become(proxyAddress).send({ from: multisig });
  console.log("Implementation upgraded");

  const actualImpl = await proxy.methods.implementation().call();
  console.log("New impl:", actualImpl);

  const vault = getContractAt("XVSVault", proxyAddress);
  const newVotes = await vault.methods.getCurrentVotes(deployer).call();
  console.log("New voting power:", newVotes);
  const xvsAddress = await vault.methods.xvsAddress().call();
  console.log("XVS address:", xvsAddress);

  expect(newVotes).to.equal("0");
  expect(await vault.methods.delegates("0xe8833153aE9171452855D391A1653766b70bdCcF").call()).to.equal(
    "0x0000000000000000000000000000000000000000",
  );

  async function testVotingPower() {
    await impersonate(guy);
    const tx1 = await vault.methods.delegate(deployer).send({ from: team });
    const tx2 = await vault.methods.delegate(deployer).send({ from: guy });

    const newDeployerVotes = await vault.methods.getCurrentVotes(deployer).call();
    console.log("New deployer votes:", newDeployerVotes);
    expect(newDeployerVotes).to.equal("300002100000000000000000");

    expect(await vault.methods.numCheckpoints(deployer).call()).to.equal("2");

    expect(await vault.methods.checkpoints(deployer, 0).call()).to.deep.include({
      fromBlock: tx1.blockNumber.toString(),
      votes: "300000000000000000000000",
    });

    expect(await vault.methods.checkpoints(deployer, 1).call()).to.deep.include({
      fromBlock: tx2.blockNumber.toString(),
      votes: "300002100000000000000000",
    });

    console.log("Checkpoints validated");
  }
  await testVotingPower();

  async function testWithdrawals() {
    console.log("Requesting withdrawal of 2.1 XVS");
    const tx3 = await vault.methods.requestWithdrawal(xvsAddress, 0, "2100000000000000000").send({ from: team });
    const newDeployerVotes = await vault.methods.getCurrentVotes(deployer).call();
    console.log("Deployer votes after withdrawal:", newDeployerVotes);
    expect(await vault.methods.getUserInfo(xvsAddress, 0, team).call()).to.deep.include({
      amount: "300000000000000000000000",
      pendingWithdrawals: "2100000000000000000",
    });
    expect(await vault.methods.numCheckpoints(deployer).call()).to.equal("3");
    expect(await vault.methods.checkpoints(deployer, 2).call()).to.deep.include({
      fromBlock: tx3.blockNumber.toString(),
      votes: "300000000000000000000000",
    });
    console.log("Checkpoints validated");
  }
  await testWithdrawals();
}

upgradeVault()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
