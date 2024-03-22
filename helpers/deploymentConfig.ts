import { contracts as governanceBscMainnet } from "@venusprotocol/governance-contracts/deployments/bscmainnet.json";
import { contracts as governanceBscTestnet } from "@venusprotocol/governance-contracts/deployments/bsctestnet.json";
import { ethers } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

import { addresses as venusProtocolBscMainnet } from "../deployments/bscmainnet_addresses.json";
import { addresses as venusProtocolBscTestnet } from "../deployments/bsctestnet_addresses.json";
import { convertToUnit } from "./utils";

export enum InterestRateModels {
  WhitePaper,
  JumpRate,
}

export type TokenConfig = {
  isMock: boolean;
  name?: string;
  symbol: string;
  decimals?: number;
  tokenAddress: string;
  faucetInitialLiquidity?: boolean;
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

export type PreconfiguredAddresses = { [contract: string]: string };

export type DeploymentConfig = {
  tokensConfig: TokenConfig[];
  marketsConfig: VTokenConfig[];
  preconfiguredAddresses: PreconfiguredAddresses;
};

export type NetworkConfig = {
  hardhat: DeploymentConfig;
  bsctestnet: DeploymentConfig;
  bscmainnet: DeploymentConfig;
};

const preconfiguredAddresses = {
  hardhat: {
    VTreasury: "account:deployer",
  },
  bsctestnet: {
    VTreasury: venusProtocolBscTestnet.VTreasury,
    NormalTimelock: governanceBscTestnet.NormalTimelock.address,
    VTokenImpl: "0x8d79c8f4400fe68fd17040539fe5e1706c1f2850",
  },
  bscmainnet: {
    VTreasury: venusProtocolBscMainnet.VTreasury,
    NormalTimelock: governanceBscMainnet.NormalTimelock.address,
    VTokenImpl: "0xc3279442a5acacf0a2ecb015d1cddbb3e0f3f775",
  },
};

export const globalConfig: NetworkConfig = {
  hardhat: {
    tokensConfig: [
      {
        isMock: true,
        name: "First Digital USD",
        symbol: "FDUSD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
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
        vTokenReceiver: venusProtocolBscTestnet.VTreasury,
      },
    ],
    preconfiguredAddresses: preconfiguredAddresses.bsctestnet,
  },
  bsctestnet: {
    tokensConfig: [
      {
        isMock: true,
        name: "First Digital USD",
        symbol: "FDUSD",
        decimals: 18,
        tokenAddress: ethers.constants.AddressZero,
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
        vTokenReceiver: venusProtocolBscTestnet.VTreasury,
      },
    ],
    preconfiguredAddresses: preconfiguredAddresses.bsctestnet,
  },
  bscmainnet: {
    tokensConfig: [
      {
        isMock: false,
        name: "First Digital USD",
        symbol: "FDUSD",
        decimals: 18,
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
        multiplierPerYear: convertToUnit("0.06875", 18),
        jumpMultiplierPerYear: convertToUnit("2.5", 18),
        kink_: convertToUnit("0.8", 18),
        collateralFactor: convertToUnit("0.75", 18),
        liquidationThreshold: convertToUnit("0.8", 18),
        reserveFactor: convertToUnit("0.1", 18),
        initialSupply: convertToUnit(9000, 18),
        supplyCap: convertToUnit(5_500_000, 18),
        borrowCap: convertToUnit(4_400_000, 18),
        vTokenReceiver: venusProtocolBscMainnet.VTreasury,
      },
    ],
    preconfiguredAddresses: preconfiguredAddresses.bscmainnet,
  },
};

export async function getConfig(networkName: string): Promise<DeploymentConfig> {
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

export async function getTokenAddress(tokenConfig: TokenConfig, deployments: DeploymentsExtension) {
  if (tokenConfig.isMock) {
    const token = await deployments.get(`Mock${tokenConfig.symbol}`);
    return token.address;
  } else {
    return tokenConfig.tokenAddress;
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
