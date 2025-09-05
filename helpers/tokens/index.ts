import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { Chain } from "../chains";
import bscmainnetTokens from "./bscmainnet";
import bsctestnetTokens from "./bsctestnet";
import hardhatTokens from "./hardhat";
import { TokenConfig } from "./types";

export const tokens = {
  hardhat: hardhatTokens,
  bsctestnet: bsctestnetTokens,
  bscmainnet: bscmainnetTokens,
  sepolia: {},
  ethereum: {},
  opbnbtestnet: {},
  opbnbmainnet: {},
  arbitrumsepolia: {},
  arbitrumone: {},
  opsepolia: {},
  opmainnet: {},
  basesepolia: {},
  basemainnet: {},
  unichainsepolia: {},
  unichainmainnet: {},
  zksyncsepolia: {},
  zksyncmainnet: {},
} as const satisfies Record<Chain, Record<string, TokenConfig>>;

export type Tokens = typeof tokens;
export type ChainToken<c extends keyof Tokens> = `${c}:${keyof Tokens[c] & string}`;

export const getToken = <c extends keyof Tokens, t extends keyof Tokens[c]>(chain: c, token: t): TokenConfig => {
  return tokens[chain][token] as TokenConfig;
};

export const parseTokens = <c extends keyof Tokens, t extends keyof Tokens[c]>(
  amount: `${number}`,
  chain: c,
  token: t,
): BigNumber => {
  return parseUnits(amount, getToken(chain, token).decimals);
};
