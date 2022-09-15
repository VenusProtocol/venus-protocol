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

function mergeInterface(into, from) {
    const key = (item) => item.inputs ? `${item.name}/${item.inputs.length}` : item.name;
    const existing = into.options.jsonInterface.reduce((acc, item) => {
      acc[key(item)] = true;
      return acc;
    }, {});
    const extended = from.options.jsonInterface.reduce((acc, item) => {
      if (!(key(item) in existing))
        acc.push(item)
      return acc;
    }, into.options.jsonInterface.slice());
    into.options.jsonInterface = into.options.jsonInterface.concat(from.options.jsonInterface);
    return into;
  }

module.exports = {
    deploy,
    getContractAt,
    impersonate,
    setBalance,
    IMPERSONATION_STARTING_BALANCE,
    mergeInterface,
}
