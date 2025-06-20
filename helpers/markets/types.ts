import { BigNumber } from "ethers";
import { Chain } from "helpers/chains";
import { Tokens } from "helpers/tokens";
import { TokenConfig } from "helpers/tokens/types";

type Parsable<RawType, ParsedType> = {
  _t: "parsable";
  rawType: RawType;
  parsedType: ParsedType;
};

type ParsableNumberString = Parsable<`${number}`, BigNumber>;

export type WpRateModelParams = {
  model: "whitepaper";
  baseRatePerYear: ParsableNumberString;
  multiplierPerYear: ParsableNumberString;
};

export type JumpRateModelParams = {
  model: "jump";
  baseRatePerYear: ParsableNumberString;
  multiplierPerYear: ParsableNumberString;
  jumpMultiplierPerYear: ParsableNumberString;
  kink: ParsableNumberString;
};

export type TwoKinksRateModelParams = {
  model: "two-kinks";
  baseRatePerYear: ParsableNumberString;
  multiplierPerYear: ParsableNumberString;
  kink: ParsableNumberString;
  baseRatePerYear2: ParsableNumberString;
  multiplierPerYear2: ParsableNumberString;
  kink2: ParsableNumberString;
  jumpMultiplierPerYear: ParsableNumberString;
};

export type RateModelParams = WpRateModelParams | JumpRateModelParams | TwoKinksRateModelParams;

export type RiskParameters = {
  collateralFactor: ParsableNumberString;
  reserveFactor: ParsableNumberString;
  supplyCap: Parsable<`${number}` | "uncapped", BigNumber>;
  borrowCap: Parsable<`${number}` | "uncapped", BigNumber>;
};

export type InitialSupply = {
  amount: ParsableNumberString;
  vTokenReceiver: string;
};

export type VTokenConfig<chain extends Chain = Chain> = {
  name: string;
  symbol: string;
  asset: Parsable<keyof Tokens[chain] & string, TokenConfig>;
  interestRateModel: RateModelParams;
  riskParameters: RiskParameters;
  initialSupply?: InitialSupply;
  flashloanConfig?: FlashloanConfig;
};

export type FlashloanConfig = {
  isFlashLoanEnabled: boolean;
  flashLoanProtocolFeeMantissa: string;
  flashLoanSupplierFeeMantissa: string;
};

export type Raw<T> = T extends object
  ? {
      [k in keyof T]: T[k] extends Parsable<infer rawType, infer _parsedType> ? rawType : Raw<T[k]>;
    }
  : T;

export type Parsed<T> = T extends object
  ? {
      [k in keyof T]: T[k] extends Parsable<infer _rawType, infer parsedType> ? parsedType : Parsed<T[k]>;
    }
  : T;

export type RawVTokenConfig<chain extends Chain> = Raw<VTokenConfig<chain>>;
export type ParsedVTokenConfig = Parsed<VTokenConfig>;
