const { web3, artifacts, network } = require('hardhat');

function getContractAt(contract, addr) {
    const obj = artifacts.require(contract);
    return new web3.eth.Contract(obj.abi, addr);
}

function deploy(contract, ...arguments) {
    const obj = artifacts.require(contract);
    const Contract = new web3.eth.Contract(obj.abi);
    return Contract.deploy({ data: obj.bytecode, arguments })
}

async function impersonate(addr) {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [addr],
    });
    await network.provider.send("hardhat_setBalance", [
        addr,
        "0x10000000000000000000000",
    ]);
}

module.exports = {
    deploy,
    getContractAt,
    impersonate
}
