const { deploy, getContractAt, impersonate } = require('../utils/misc');

async function upgradeVault() {
    const deployer = '0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D';
    const proxyAddress = '0x051100480289e704d20e9db4804837068f3f9204';
    const multisig = '0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B';

    await impersonate(deployer);
    await impersonate(multisig);
    
    console.log('Deploying XVSVault...');
    const vaultImpl = await deploy('XVSVault').send({ from: deployer });
    console.log(`Deployed XVSVault to ${vaultImpl._address}`);

    const proxy = getContractAt('XVSVaultProxy', proxyAddress);
    await proxy.methods._setPendingImplementation(vaultImpl._address).send({ from: multisig });
    console.log('Pending impl updated');

    console.log('Accepting impl');
    await vaultImpl.methods._become(proxyAddress).send({ from: multisig });
    console.log('Implementation upgraded');

    const actualImpl = await proxy.methods.implementation().call();
    console.log('New impl:', actualImpl)

    const vault = getContractAt('XVSVault', proxyAddress);
    const newVotes = await vault.methods.getCurrentVotes(deployer).call();
    console.log('New voting power:', newVotes);
}

upgradeVault()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });