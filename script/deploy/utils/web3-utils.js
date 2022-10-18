"use strict";

const BigNum = require("bignumber.js");
const ethers = require("ethers");

function address(n) {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

function sleep(timeout) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

async function bnbBalance(addr) {
  return ethers.BigNumber.from(new BigNum(await web3.eth.getBalance(addr)).toFixed());
}

async function bnbGasCost(receipt) {
  const tx = await web3.eth.getTransaction(receipt.transactionHash);
  const gasUsed = new BigNum(receipt.gasUsed);
  const gasPrice = new BigNum(tx.gasPrice);
  return ethers.BigNumber.from(gasUsed.times(gasPrice).toFixed());
}

function bnbExp(num) {
  return bnbMantissa(num, 1e18);
}
function bnbDouble(num) {
  return bnbMantissa(num, 1e36);
}
function bnbMantissa(num, scale = 1e18) {
  if (num < 0) return ethers.BigNumber.from(new BigNum(2).pow(256).plus(num).toFixed());
  return ethers.BigNumber.from(new BigNum(num).times(scale).toFixed());
}

function bnbUnsigned(num) {
  return ethers.BigNumber.from(new BigNum(num).toFixed());
}

function mergeInterface(into, from) {
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
  if (provider._providers) provider = provider._providers.find(p => p._ganacheProvider)._ganacheProvider;
  return provider.manager.state.unlocked_accounts;
}

function unlockedAccount(a) {
  return unlockedAccounts()[a.toLowerCase()];
}

async function getblockNumber() {
  let { result: num } = await rpc({ method: "eth_blockNumber" });
  return parseInt(num);
}

async function rpc(request) {
  return new Promise((okay, fail) => web3.currentProvider.send(request, (err, res) => (err ? fail(err) : okay(res))));
}

async function both(contract, method, args = [], opts = {}) {
  const reply = await call(contract, method, args, opts);
  const receipt = await send(contract, method, args, opts);
  return { reply, receipt };
}

async function sendFallback(contract, opts = {}) {
  const receipt = await web3.eth.sendTransaction({
    to: contract._address,
    ...Object.assign(getContractDefaults(), opts),
  });
  return Object.assign(receipt, { events: receipt.logs });
}

function getEpochTimeInSeconds() {
  return Math.round(new Date().getTime() / 1000);
}

async function getDeployer(ethers) {
  const signers = await ethers.getSigners();
  return await signers[0].getAddress();
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
  rpc,
  both,
  sendFallback,
  sleep,
  getEpochTimeInSeconds,
  getDeployer,
};
