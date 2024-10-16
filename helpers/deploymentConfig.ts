import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { convertToUnit } from "./utils";

export enum InterestRateModels {
  WhitePaper,
  JumpRate,
}

export type TokenConfig =
  | {
      isMock: true;
      name: string;
      symbol: string;
      decimals: number;
    }
  | {
      isMock: false;
      symbol: string;
      tokenAddress: string;
    };

export type VTokenConfig = {
  name: string;
  symbol: string;
  asset: string; // This should match a name property from a TokenCofig
  rateModel: string;
  baseRatePerYear: string;
  multiplierPerYear: string;
  jumpMultiplierPerYear: string;
  kink_: string;
  collateralFactor: string;
  liquidationThreshold: string;
  reserveFactor: string;
  initialSupply: string;
  supplyCap: string;
  borrowCap: string;
  vTokenReceiver: string;
};

export type DeploymentConfig = {
  tokensConfig: TokenConfig[];
  marketsConfig: VTokenConfig[];
};

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
};

export const getGlobalConfig: () => Promise<NetworkConfig> = async () => {
  let vTreasuryAddress;
  try {
    vTreasuryAddress = (await ethers.getContract("VTreasuryV8")).address;
  } catch {
    vTreasuryAddress = (await ethers.getContract("VTreasury")).address;
  }
  return {
    hardhat: {
      tokensConfig: [
        {
          isMock: true,
          name: "First Digital USD",
          symbol: "FDUSD",
          decimals: 18,
        },
        {
          isMock: true,
          name: "Wrapped BNB",
          symbol: "WBNB",
          decimals: 18,
        },
        {
          isMock: true,
          name: "DOGE",
          symbol: "DOGE",
          decimals: 18,
        },
        {
          isMock: true,
          name: "USDT",
          symbol: "USDT",
          decimals: 18,
        },
      ],
      marketsConfig: [
        {
          name: "Venus FDUSD",
          asset: "FDUSD",
          symbol: "vFDUSD",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.06875", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.75", 18),
          liquidationThreshold: convertToUnit("0.8", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(9000, 18),
          supplyCap: convertToUnit(5_500_000, 18),
          borrowCap: convertToUnit(4_400_000, 18),
          vTokenReceiver: vTreasuryAddress,
        },
        {
          name: "Venus DOGE",
          asset: "DOGE",
          symbol: "vDOGE",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.06875", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.9", 18),
          liquidationThreshold: convertToUnit("0.95", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit("9000", 18),
          supplyCap: convertToUnit("5500000000", 18),
          borrowCap: convertToUnit("4400000000", 18),
          vTokenReceiver: vTreasuryAddress,
        },
        {
          name: "Venus USDT",
          asset: "USDT",
          symbol: "vUSDT",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.06875", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.9", 18),
          liquidationThreshold: convertToUnit("0.95", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit("9000", 18),
          supplyCap: convertToUnit("5500000", 18),
          borrowCap: convertToUnit("4400000", 18),
          vTokenReceiver: vTreasuryAddress,
        },
      ],
    },
    bsctestnet: {
      tokensConfig: [
        {
          isMock: true,
          name: "First Digital USD",
          symbol: "FDUSD",
          decimals: 18,
        },
        {
          isMock: false,
          name: "Trust Wallet",
          symbol: "TWT",
          decimals: 18,
          tokenAddress: "0xb99c6b26fdf3678c6e2aff8466e3625a0e7182f8",
        },
      ],
      marketsConfig: [
        {
          name: "Venus FDUSD",
          asset: "FDUSD",
          symbol: "vFDUSD",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.06875", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.75", 18),
          liquidationThreshold: convertToUnit("0.8", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(9000, 18),
          supplyCap: convertToUnit(5_500_000, 18),
          borrowCap: convertToUnit(4_400_000, 18),
          vTokenReceiver: vTreasuryAddress,
        },
        {
          name: "Venus TWT",
          asset: "TWT",
          symbol: "vTWT",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: convertToUnit("0.02", 18),
          multiplierPerYear: convertToUnit("0.2", 18),
          jumpMultiplierPerYear: convertToUnit("3", 18),
          kink_: convertToUnit("0.5", 18),
          collateralFactor: convertToUnit("0.5", 18),
          reserveFactor: convertToUnit("0.25", 18),
          initialSupply: convertToUnit(5_000, 18),
          supplyCap: convertToUnit(3_000_000, 18),
          borrowCap: convertToUnit(1_000_000, 18),
          vTokenReceiver: vTreasuryAddress,
        },
      ],
    },
    bscmainnet: {
      tokensConfig: [
        {
          isMock: false,
          symbol: "FDUSD",
          tokenAddress: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409",
        },
      ],
      marketsConfig: [
        {
          name: "Venus FDUSD",
          asset: "FDUSD",
          symbol: "vFDUSD",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.075", 18),
          jumpMultiplierPerYear: convertToUnit("5.0", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.75", 18),
          liquidationThreshold: convertToUnit("0.8", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(9000, 18),
          supplyCap: convertToUnit(5_500_000, 18),
          borrowCap: convertToUnit(4_400_000, 18),
          vTokenReceiver: vTreasuryAddress,
        },
        {
          name: "Venus DOGE",
          asset: "DOGE",
          symbol: "vDOGE",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.06875", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.75", 18),
          liquidationThreshold: convertToUnit("0.8", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(9000, 18),
          supplyCap: convertToUnit(5_500_000, 18),
          borrowCap: convertToUnit(4_400_000, 18),
          vTokenReceiver: vTreasuryAddress,
        },
        {
          name: "Venus USDT",
          asset: "USDT",
          symbol: "vUSDT",
          rateModel: InterestRateModels.JumpRate.toString(),
          baseRatePerYear: "0",
          multiplierPerYear: convertToUnit("0.1", 18),
          jumpMultiplierPerYear: convertToUnit("2.5", 18),
          kink_: convertToUnit("0.8", 18),
          collateralFactor: convertToUnit("0.75", 18),
          liquidationThreshold: convertToUnit("0.8", 18),
          reserveFactor: convertToUnit("0.1", 18),
          initialSupply: convertToUnit(9000, 18),
          supplyCap: convertToUnit(5_500_000, 18),
          borrowCap: convertToUnit(4_400_000, 18),
          vTokenReceiver: vTreasuryAddress,
        },
      ],
    },
  };
};

export async function getConfig(networkName: string): Promise<DeploymentConfig> {
  const globalConfig = await getGlobalConfig();
  switch (networkName) {
    case "hardhat":
      return globalConfig.hardhat;
    case "bsctestnet":
      return globalConfig.bsctestnet;
    case "bscmainnet":
      return globalConfig.bscmainnet;
    default:
      throw new Error(`config for network ${networkName} is not available.`);
  }
}

export function getTokenConfig(tokenSymbol: string, tokens: TokenConfig[]): TokenConfig {
  const tokenCofig = tokens.find(
    ({ symbol }) => symbol.toLocaleLowerCase().trim() === tokenSymbol.toLocaleLowerCase().trim(),
  );

  if (tokenCofig) {
    return tokenCofig;
  } else {
    throw Error(`Token ${tokenSymbol} is not found in the config`);
  }
}

export const getContractAddressOrNullAddress = async (deployments: DeploymentsExtension, name: string) => {
  try {
    return (await deployments.get(name)).address;
  } catch (e) {
    console.error(`${name} not found returning null address`);
    return "0x0000000000000000000000000000000000000000";
  }
};

export const onlyHardhat = () => async (hre: HardhatRuntimeEnvironment) => {
  return hre.network.name !== "hardhat";
};

export const skipRemoteNetworks = () => async (hre: HardhatRuntimeEnvironment) => {
  return hre.network.name !== "bscmainnet" && hre.network.name !== "bsctestnet" && hre.network.name !== "hardhat";
};

export const skipSourceNetworks =
  ({ hardhat }: { hardhat: boolean } = { hardhat: false }) =>
  async (hre: HardhatRuntimeEnvironment) => {
    return hre.network.name === "bsctestnet" || hre.network.name === "bscmainnet" || hardhat;
  };
