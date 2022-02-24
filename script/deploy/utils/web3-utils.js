"use strict";

const BigNum = require('bignumber.js');
const ethers = require('ethers');
BigNum.prototype.add = BigNum.prototype.plus;
BigNum.prototype.mul = BigNum.prototype.times;
BigNum.prototype.sub = BigNum.prototype.minus;

function address(n) {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

function sleep(timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

async function bnbBalance(addr) {
  return new BigNum(await web3.eth.getBalance(addr));
}

async function bnbGasCost(receipt) {
  const tx = await web3.eth.getTransaction(receipt.transactionHash);
  const gasUsed = new BigNum(receipt.gasUsed);
  const gasPrice = new BigNum(tx.gasPrice);
  return ethers.utils.bigNumberify(gasUsed.times(gasPrice).toFixed());
}

function bnbExp(num) { return bnbMantissa(num, 1e18) }
function bnbDouble(num) { return bnbMantissa(num, 1e36) }
function bnbMantissa(num, scale = 1e18) {
  if (num < 0)
    return ethers.utils.bigNumberify(new BigNum(2).pow(256).plus(num).toFixed());
  return ethers.utils.bigNumberify(new BigNum(num).times(scale).toFixed());
}

function bnbUnsigned(num) {
  return ethers.utils.bigNumberify(new BigNum(num).toFixed());
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

function getContractDefaults() {
  return { gas: 20000000, gasPrice: 20000 };
}

function keccak256(values) {
  return ethers.utils.keccak256(values);
}

function unlockedAccounts() {
  let provider = web3.currentProvider;
  if (provider._providers)
    provider = provider._providers.find(p => p._ganacheProvider)._ganacheProvider;
  return provider.manager.state.unlocked_accounts;
}

function unlockedAccount(a) {
  return unlockedAccounts()[a.toLowerCase()];
}

async function getblockNumber() {
  let { result: num } = await rpc({ method: 'eth_blockNumber' });
  return parseInt(num);
}

async function getBlockTimestamp() {
  const blockNumber = await getblockNumber();
  const blockRsp = await rpc({method: 'eth_getBlockByNumber', params: [blockNumber]});
  return blockRsp ? blockTimestampRsp.timestamp : 0;
}

async function rpc(request) {
  return new Promise((okay, fail) => web3.currentProvider.send(request, (err, res) => err ? fail(err) : okay(res)));
}

async function both(contract, method, args = [], opts = {}) {
  const reply = await call(contract, method, args, opts);
  const receipt = await send(contract, method, args, opts);
  return { reply, receipt };
}

async function sendFallback(contract, opts = {}) {
  const receipt = await web3.eth.sendTransaction({ to: contract._address, ...Object.assign(getContractDefaults(), opts) });
  return Object.assign(receipt, { events: receipt.logs });
}

module.exports = {
  address,
  encodeParameters,
  bnbBalance,
  bnbGasCost,
  bnbExp,
  bnbDouble,
  bnbMantissa,
  bnbUnsigned,
  mergeInterface,
  keccak256,
  unlockedAccounts,
  unlockedAccount,
  getblockNumber,
  getBlockTimestamp,
  rpc,
  both,
  sendFallback,
  sleep
};