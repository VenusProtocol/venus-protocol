import BigNumber from "bignumber.js";

import { SUPPORTED_NETWORKS } from "./constants";

BigNumber.config({
  FORMAT: {
    decimalSeparator: ".",
    groupSize: 0,
    groupSeparator: "",
    secondaryGroupSize: 0,
    fractionGroupSeparator: "",
    fractionGroupSize: 0,
  },
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: 1e9,
});

export const convertToUnit = (amount: string | number, decimals: number) => {
  return new BigNumber(amount).times(new BigNumber(10).pow(decimals)).toString();
};

export const convertToBigInt = (amount: string | number, decimals: number) => {
  return BigInt(convertToUnit(amount, decimals));
};
export const getSourceChainId = async (network: SUPPORTED_NETWORKS) => {
  if (network === "sepolia" || network === "opbnbtestnet") {
    return 10102;
  } else if (network === "ethereum" || network === "opbnbmainnet") {
    return 102;
  }
  return 1;
};
