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

const IMPERSONATION_STARTING_BALANCE = '0x10000000000000000000000';

function setBalance(addr, balance) {
  return network.provider.send("hardhat_setBalance", [addr, balance]);
}

async function impersonate(addr) {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [addr],
    });
    await setBalance(addr, IMPERSONATION_STARTING_BALANCE);
}

module.exports = {
    deploy,
    getContractAt,
    impersonate,
    setBalance,
    IMPERSONATION_STARTING_BALANCE,
}
