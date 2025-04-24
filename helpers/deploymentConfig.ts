import { DeploymentsExtension } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { ParsedVTokenConfig } from "./markets/types";

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

export type DeploymentConfig = {
  tokensConfig: Record<string, TokenConfig>;
  marketsConfig: ParsedVTokenConfig[];
};

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
