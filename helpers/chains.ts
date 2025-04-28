const knownChains = [
  "hardhat",
  "bsctestnet",
  "bscmainnet",
  "sepolia",
  "ethereum",
  "opbnbtestnet",
  "opbnbmainnet",
  "arbitrumsepolia",
  "arbitrumone",
  "opsepolia",
  "opmainnet",
  "basesepolia",
  "basemainnet",
  "unichainsepolia",
  "unichainmainnet",
  "berachainbartio",
  "zksyncsepolia",
  "zksyncmainnet",
] as const;

export type Chain = { [k in keyof typeof knownChains]: (typeof knownChains)[k] }[number];

export type BlocksPerYear = number | "time-based";

export const blocksPerYear = {
  hardhat: 100,
  bsctestnet: 21_024_000, // 1.5 sec per block
  bscmainnet: 21_024_000,
  sepolia: 2_628_000, // 12 sec per block
  ethereum: 2_628_000,
  opbnbtestnet: 63_072_000, // 0.5 sec per block
  opbnbmainnet: 63_072_000,
  arbitrumsepolia: "time-based",
  arbitrumone: "time-based",
  opsepolia: "time-based",
  opmainnet: "time-based",
  basesepolia: "time-based",
  basemainnet: "time-based",
  unichainsepolia: "time-based",
  unichainmainnet: "time-based",
  berachainbartio: "time-based",
  zksyncsepolia: "time-based",
  zksyncmainnet: "time-based",
} as const satisfies Record<Chain, BlocksPerYear>;

export type TimeBasedChain = keyof {
  [k in Chain as (typeof blocksPerYear)[k] extends "time-based" ? k : never]: void;
};
export type BlockBasedChain = keyof {
  [k in Chain as (typeof blocksPerYear)[k] extends number ? k : never]: void;
};

export const isKnownChain = (networkName: string): networkName is Chain => {
  return (knownChains as readonly string[]).includes(networkName);
};

export const assertKnownChain = (networkName: string): Chain => {
  if (!isKnownChain(networkName)) {
    throw new Error(`Unsupported network ${networkName}`);
  }
  return networkName;
};

export const isTimeBasedChain = (networkName: string): networkName is TimeBasedChain => {
  return (blocksPerYear as Record<string, BlocksPerYear>)[networkName] === "time-based";
};

export const assertTimeBasedChain = (networkName: string): TimeBasedChain => {
  if (!isTimeBasedChain(networkName)) {
    throw new Error(`Expected ${networkName} to be a time-based chain`);
  }
  return networkName;
};

export const isBlockBasedChain = (networkName: string): networkName is BlockBasedChain => {
  return typeof (blocksPerYear as Record<string, BlocksPerYear>)[networkName] === "number";
};

export const assertBlockBasedChain = (networkName: string): BlockBasedChain => {
  if (!isBlockBasedChain(networkName)) {
    throw new Error(`Expected ${networkName} to be a block-based chain`);
  }
  return networkName;
};
