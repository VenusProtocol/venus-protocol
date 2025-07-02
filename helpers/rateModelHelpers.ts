import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";

import { Parsed, RateModelParams } from "./markets/types";

export const mantissaToBps = (num: BigNumber) => {
  return num.div(parseUnits("1", 14)).toString();
};

export const getRateModelName = (params: Parsed<RateModelParams>, blocksPerYear: number): string => {
  const suffix = `bpy${blocksPerYear}`;
  switch (params.model) {
    case "whitepaper": {
      const [b, m] = [params.baseRatePerYear, params.multiplierPerYear].map(mantissaToBps);
      return `WhitePaperInterestRateModel_base${b}bps_slope${m}bps_${suffix}`;
    }
    case "jump": {
      const { baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink } = params;
      const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink].map(mantissaToBps);
      return `JumpRateModel_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps_${suffix}`;
    }
    case "two-kinks": {
      const [b, m, k, m2, b2, k2, j] = [
        params.baseRatePerYear,
        params.multiplierPerYear,
        params.kink,
        params.multiplierPerYear2,
        params.baseRatePerYear2,
        params.kink2,
        params.jumpMultiplierPerYear,
      ].map(mantissaToBps);
      return `TwoKinks_base${b}bps_slope${m}bps_kink${k}bps_slope2${m2}bps_base2${b2}bps_kink2${k2}bps_jump${j}bps_${suffix}`;
    }
  }
};
