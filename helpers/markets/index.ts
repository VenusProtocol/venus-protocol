import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { Chain } from "../chains";
import { getToken, parseTokens } from "../tokens";
import bscmainnetMarketsList from "./bscmainnet";
import bsctestnetMarketsList from "./bsctestnet";
import hardhatMarketsList from "./hardhat";
import {
  JumpRateModelParams,
  Parsed,
  ParsedVTokenConfig,
  RateModelParams,
  Raw,
  RawVTokenConfig,
  TwoKinksRateModelParams,
  WpRateModelParams,
} from "./types";

const parseWpRateModel = (raw: Raw<WpRateModelParams>): Parsed<WpRateModelParams> => {
  return {
    ...raw,
    baseRatePerYear: parseUnits(raw.baseRatePerYear, 18),
    multiplierPerYear: parseUnits(raw.multiplierPerYear, 18),
  };
};

const parseJumpRateModel = (raw: Raw<JumpRateModelParams>): Parsed<JumpRateModelParams> => {
  return {
    ...raw,
    baseRatePerYear: parseUnits(raw.baseRatePerYear, 18),
    multiplierPerYear: parseUnits(raw.multiplierPerYear, 18),
    jumpMultiplierPerYear: parseUnits(raw.jumpMultiplierPerYear, 18),
    kink: parseUnits(raw.kink, 18),
  };
};

const parseTwoKinksRateModel = (raw: Raw<TwoKinksRateModelParams>): Parsed<TwoKinksRateModelParams> => {
  return {
    ...raw,
    baseRatePerYear: parseUnits(raw.baseRatePerYear, 18),
    multiplierPerYear: parseUnits(raw.multiplierPerYear, 18),
    kink: parseUnits(raw.kink, 18),
    baseRatePerYear2: parseUnits(raw.baseRatePerYear2, 18),
    multiplierPerYear2: parseUnits(raw.multiplierPerYear2, 18),
    kink2: parseUnits(raw.kink2, 18),
    jumpMultiplierPerYear: parseUnits(raw.jumpMultiplierPerYear, 18),
  };
};

const parseRateModel = (raw: Raw<RateModelParams>): Parsed<RateModelParams> => {
  switch (raw.model) {
    case "whitepaper":
      return parseWpRateModel(raw);
    case "jump":
      return parseJumpRateModel(raw);
    case "two-kinks":
      return parseTwoKinksRateModel(raw);
  }
};

const parseMarket = <chain extends Chain>(chain: chain, raw: RawVTokenConfig<chain>): ParsedVTokenConfig => {
  const { supplyCap, borrowCap } = raw.riskParameters;
  const { MaxUint256 } = ethers.constants;
  return {
    ...raw,
    asset: getToken(chain, raw.asset),
    interestRateModel: parseRateModel(raw.interestRateModel),
    riskParameters: {
      collateralFactor: parseUnits(raw.riskParameters.collateralFactor, 18),
      reserveFactor: parseUnits(raw.riskParameters.reserveFactor, 18),
      supplyCap: supplyCap === "uncapped" ? MaxUint256 : parseTokens(supplyCap, chain, raw.asset),
      borrowCap: borrowCap === "uncapped" ? MaxUint256 : parseTokens(borrowCap, chain, raw.asset),
    },
    initialSupply: raw.initialSupply
      ? {
          amount: parseTokens(raw.initialSupply.amount, chain, raw.asset),
          vTokenReceiver: raw.initialSupply.vTokenReceiver,
        }
      : undefined,
  };
};

const parseMarkets = <chain extends Chain>(
  chain: chain,
  configs: readonly RawVTokenConfig<chain>[],
): ParsedVTokenConfig[] => {
  return configs.map(config => parseMarket(chain, config));
};

export const markets = {
  hardhat: parseMarkets("hardhat", hardhatMarketsList),
  bscmainnet: parseMarkets("bscmainnet", bscmainnetMarketsList),
  bsctestnet: parseMarkets("bsctestnet", bsctestnetMarketsList),
  sepolia: [],
  ethereum: [],
  opbnbtestnet: [],
  opbnbmainnet: [],
  arbitrumsepolia: [],
  arbitrumone: [],
  opsepolia: [],
  opmainnet: [],
  basesepolia: [],
  basemainnet: [],
  unichainsepolia: [],
  unichainmainnet: [],
  berachainbartio: [],
  zksyncsepolia: [],
  zksyncmainnet: [],
} as const satisfies Record<Chain, readonly ParsedVTokenConfig[]>;
