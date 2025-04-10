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
  berachainbartio: {},
  zksyncsepolia: {},
  zksyncmainnet: {},
} as const satisfies Record<Chain, Record<string, TokenConfig>>;

export type Tokens = typeof tokens;
export type ChainToken<c extends keyof Tokens> = `${c}:${keyof Tokens[c] & string}`;

const splitChain = <c extends keyof Tokens, t extends keyof Tokens[c] & string>(sig: `${c}:${t}`): [c, t] => {
  const idx = sig.indexOf(":");
  return [sig.slice(0, idx), sig.slice(idx + 1)] as [c, t];
};

export const parseTokens = <c extends keyof Tokens>(amount: `${number}`, token: ChainToken<c>): BigNumber => {
  const [chain, tokenName] = splitChain(token);
  return parseTokensExplicit(amount, chain, tokenName);
};

export const getToken = <c extends keyof Tokens, t extends keyof Tokens[c]>(chain: c, token: t): TokenConfig => {
  return tokens[chain][token] as TokenConfig;
};

export const parseTokensExplicit = <c extends keyof Tokens, t extends keyof Tokens[c]>(
  amount: `${number}`,
  chain: c,
  token: t,
): BigNumber => {
  return parseUnits(amount, getToken(chain, token).decimals);
};
