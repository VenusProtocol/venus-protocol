import { Raw, VTokenConfig } from "./types";

export default [
  {
    name: "Venus FDUSD",
    asset: "FDUSD",
    symbol: "vFDUSD",
    interestRateModel: {
      model: "jump",
      baseRatePerYear: "0",
      multiplierPerYear: "0.06875",
      jumpMultiplierPerYear: "2.5",
      kink: "0.8",
    },
    riskParameters: {
      collateralFactor: "0.75",
      reserveFactor: "0.1",
      supplyCap: "5500000",
      borrowCap: "4400000",
    },
    initialSupply: {
      amount: "9000",
      vTokenReceiver: "VTreasury",
    }
  },
  {
    name: "Venus DOGE",
    asset: "DOGE",
    symbol: "vDOGE",
    interestRateModel: {
      model: "jump",
      baseRatePerYear: "0",
      multiplierPerYear: "0.06875",
      jumpMultiplierPerYear: "2.5",
      kink: "0.8",
    },
    riskParameters: {
      collateralFactor: "0.9",
      reserveFactor: "0.1",
      supplyCap: "5500000000",
      borrowCap: "4400000000",
    },
    initialSupply: {
      amount: "9000",
      vTokenReceiver: "VTreasury",
    }
  },
  {
    name: "Venus USDT",
    asset: "USDT",
    symbol: "vUSDT",
    interestRateModel: {
      model: "jump",
      baseRatePerYear: "0",
      multiplierPerYear: "0.06875",
      jumpMultiplierPerYear: "2.5",
      kink: "0.8",
    },
    riskParameters: {
      collateralFactor: "0.9",
      reserveFactor: "0.1",
      supplyCap: "5500000",
      borrowCap: "4400000",
    },
    initialSupply: {
      amount: "9000",
      vTokenReceiver: "VTreasury",
    }
  },
] as const satisfies readonly Raw<VTokenConfig<"hardhat">>[];
