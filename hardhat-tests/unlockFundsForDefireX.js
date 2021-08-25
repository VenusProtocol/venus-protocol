const VBep20Delegate = artifacts.require("VBep20Delegate");
const VBep20Delegator = artifacts.require("VBep20Delegator");
const fetchUrl = require("fetch").fetchUrl;

// const DEFIREX_DEPLOYER = '0xdAE0aca4B9B38199408ffaB32562Bf7B3B0495fE';
// Some hardcoded DefireX contracts
const contractWithLockedUSDT = '0x22b433402B65DcCbE79fE66B4990A2569aB01572';
const contractWithLockedBUSD = '0x3b1A4F61bD3d7301EdBd3ea2A5E05Ede8dDA812D';
const contractWithLockedAbi = JSON.parse(`[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"address payable","name":"_to","type":"address"},{"internalType":"bytes","name":"_data","type":"bytes"}],"name":"cast","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"controller","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address payable","name":"_to","type":"address"}],"name":"withdrawEth","outputs":[],"stateMutability":"nonpayable","type":"function"},{"stateMutability":"payable","type":"receive"}]`);
const contractDefireXControllerAbi = JSON.parse(`[{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]`);

let config = new Promise((x) => {
    fetchUrl("https://raw.githubusercontent.com/VenusProtocol/venus-config/master/networks/mainnet.json", function(error, meta, body){
        if (error) throw new Error(error);
        x(JSON.parse(body.toString('utf8')));
    });
});

async function getDefireXFundsReceiver()
{
    const _contractWithLockedUSDT = new web3.eth.Contract(contractWithLockedAbi, contractWithLockedUSDT);
    const _contractWithLockedBUSD = new web3.eth.Contract(contractWithLockedAbi, contractWithLockedBUSD);
    const controllerUSDT = await _contractWithLockedUSDT.methods.controller().call();
    const controllerBUSD = await _contractWithLockedBUSD.methods.controller().call();
    const _controllerUSDT = new web3.eth.Contract(contractDefireXControllerAbi, controllerUSDT);
    const _controllerBUSD = new web3.eth.Contract(contractDefireXControllerAbi, controllerBUSD);
    const ownerUSDT = await _controllerUSDT.methods.owner().call();
    const ownerBUSD = await _controllerBUSD.methods.owner().call();
    assert.equal(ownerUSDT.toLowerCase(), ownerBUSD.toLowerCase(), "contract owners differs", );
    return ownerBUSD;
}

// Traditional Truffle test
contract("VBep20Delegate", (accounts) => {
    const OWNER = accounts[0];
    console.log('OWNER', OWNER);

    let newVBep20DelegateImplementation;

    it("deploy new VBep20Delegate", async function () {
        config = await config;

        newVBep20DelegateImplementation = await VBep20Delegate.new();
        console.log('New implementation is ', newVBep20DelegateImplementation.address);

        // Unlock Timelock contract like account to send transactions
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [config.Contracts.Timelock],
        });
        // Adds some BNB to Timelock
        await network.provider.send("hardhat_setBalance", [
            config.Contracts.Timelock,
            "0x10000000000000000000000",
        ]);
    });

    async function setImplementationAndWithdrawLockedFunds(address) {
        const vTokenDelegator = new web3.eth.Contract(VBep20Delegator.abi, address);
        const vBep20 = new web3.eth.Contract(VBep20Delegate.abi, address);
        const tokenName = await vBep20.methods.name().call();
        const DEFIREX_DEPLOYER = await getDefireXFundsReceiver();
        console.log(`Address to receive funds is ${DEFIREX_DEPLOYER}`);
        const balanceBefore = await vBep20.methods.balanceOfUnderlying(DEFIREX_DEPLOYER).call();

        const originalImplementation = await vTokenDelegator.methods.implementation().call();
        console.log(`Original ${tokenName} implementation is `, originalImplementation);

        console.log(`Set new implementation ${newVBep20DelegateImplementation.address} for ${tokenName}`);
        await vTokenDelegator.methods._setImplementation(newVBep20DelegateImplementation.address, true, "0x00").send({from: config.Contracts.Timelock});
        console.log('Call releaseStuckTokens');
        await vBep20.methods.releaseStuckTokens().send({from: config.Contracts.Timelock});
        console.log(`Set original implementation for ${tokenName}`);
        await vTokenDelegator.methods._setImplementation(originalImplementation, true, "0x00").send({from: config.Contracts.Timelock});

        // Validate
        const currentImplementation = await vTokenDelegator.methods.implementation().call();
        assert.equal(currentImplementation, originalImplementation, "Implementation differs");

        const balanceAfter = await vBep20.methods.balanceOfUnderlying(DEFIREX_DEPLOYER).call();
        console.log(`Balance ${DEFIREX_DEPLOYER} changed`, (balanceAfter - balanceBefore) / 1e18, `$ in ${tokenName}`);

        console.log('Success');
    }

    it("set implementation and withdraw locked funds for USDT", async function () {
        await setImplementationAndWithdrawLockedFunds(config.Contracts.vUSDT);
        await setImplementationAndWithdrawLockedFunds(config.Contracts.vBUSD);
    });
});
