import { Map } from "immutable";

import { Contract } from "./Contract";
import { Bep20 } from "./Contract/Bep20";
import { Comptroller } from "./Contract/Comptroller";
import { ComptrollerImpl } from "./Contract/ComptrollerImpl";
import { Governor } from "./Contract/Governor";
import { GovernorBravo } from "./Contract/GovernorBravo";
import { InterestRateModel } from "./Contract/InterestRateModel";
import { PriceOracle } from "./Contract/PriceOracle";
import { SXP } from "./Contract/SXP";
import { Timelock } from "./Contract/Timelock";
import { VAI } from "./Contract/VAI";
import { VAIController } from "./Contract/VAIController";
import { VAIControllerImpl } from "./Contract/VAIControllerImpl";
import { VBep20Delegate } from "./Contract/VBep20Delegate";
import { VToken } from "./Contract/VToken";
import { XVS } from "./Contract/XVS";
import { XVSVault, XVSVaultImpl, XVSVaultProxy } from "./Contract/XVSVault";
import { Event } from "./Event";
import { mustString } from "./Utils";
import { World } from "./World";

type ContractDataEl = string | Map<string, object> | undefined;

function getContractData(world: World, indices: string[][]): ContractDataEl {
  return indices.reduce((value: ContractDataEl, index) => {
    if (value) {
      return value;
    } else {
      return index.reduce((data: ContractDataEl, el) => {
        const lowerEl = el.toLowerCase();

        if (!data) {
          return;
        } else if (typeof data === "string") {
          return data;
        } else {
          return (data as Map<string, ContractDataEl>).find((_v, key) => key.toLowerCase().trim() === lowerEl.trim());
        }
      }, world.contractData);
    }
  }, undefined);
}

function getContractDataString(world: World, indices: string[][]): string {
  const value: ContractDataEl = getContractData(world, indices);

  if (!value || typeof value !== "string") {
    throw new Error(
      `Failed to find string value by index (got ${value}): ${JSON.stringify(
        indices,
      )}, index contains: ${JSON.stringify(world.contractData.toJSON())}`,
    );
  }

  return value;
}

export function getWorldContract<T>(world: World, indices: string[][]): T {
  const address = getContractDataString(world, indices);

  return getWorldContractByAddress<T>(world, address);
}

export function getWorldContractByAddress<T>(world: World, address: string): T {
  const contract = world.contractIndex[address.toLowerCase()];

  if (!contract) {
    throw new Error(
      `Failed to find world contract by address: ${address}, index contains: ${JSON.stringify(
        Object.keys(world.contractIndex),
      )}`,
    );
  }

  return <T>(<unknown>contract);
}

export async function getTimelock(world: World): Promise<Timelock> {
  return getWorldContract(world, [["Contracts", "Timelock"]]);
}

export async function getUnitroller(world: World): Promise<Comptroller> {
  return getWorldContract(world, [["Contracts", "Unitroller"]]);
}

export async function getVAIUnitroller(world: World): Promise<VAIController> {
  return getWorldContract(world, [["Contracts", "VAIUnitroller"]]);
}

export async function getMaximillion(world: World): Promise<Comptroller> {
  return getWorldContract(world, [["Contracts", "Maximillion"]]);
}

export async function getLiquidator(world: World): Promise<Comptroller> {
  return getWorldContract(world, [["Contracts", "Liquidator"]]);
}

export async function getComptroller(world: World): Promise<Comptroller> {
  return getWorldContract(world, [["Contracts", "Comptroller"]]);
}

export async function getComptrollerImpl(world: World, comptrollerImplArg: Event): Promise<ComptrollerImpl> {
  return getWorldContract(world, [["Comptroller", mustString(comptrollerImplArg), "address"]]);
}

export async function getVAIController(world: World): Promise<VAIController> {
  return getWorldContract(world, [["Contracts", "VAIController"]]);
}

export async function getVAIControllerImpl(world: World, vaicontrollerImplArg: Event): Promise<VAIControllerImpl> {
  return getWorldContract(world, [["VAIController", mustString(vaicontrollerImplArg), "address"]]);
}

export function getVTokenAddress(world: World, vTokenArg: string): string {
  return getContractDataString(world, [["vTokens", vTokenArg, "address"]]);
}

export function getVTokenDelegateAddress(world: World, vTokenDelegateArg: string): string {
  return getContractDataString(world, [["VTokenDelegate", vTokenDelegateArg, "address"]]);
}

export function getBep20Address(world: World, bep20Arg: string): string {
  return getContractDataString(world, [["Tokens", bep20Arg, "address"]]);
}

export function getGovernorAddress(world: World, governorArg: string): string {
  return getContractDataString(world, [["Contracts", governorArg]]);
}

export function getGovernorBravo(world: World): Promise<GovernorBravo> {
  return getWorldContract(world, [["Contracts", "GovernorBravo"]]);
}

export function getXVSVault(world: World): Promise<XVSVault> {
  return getWorldContract(world, [["Contracts", "XVSVault"]]);
}

export function getXVSVaultProxy(world: World): Promise<XVSVaultProxy> {
  return getWorldContract(world, [["Contracts", "XVSVaultProxy"]]);
}

export async function getXVSVaultImpl(world: World, xvsVaultImplArg: Event): Promise<XVSVaultImpl> {
  return getWorldContract(world, [["XVSVault", mustString(xvsVaultImplArg), "address"]]);
}

export async function getPriceOracleProxy(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [["Contracts", "PriceOracleProxy"]]);
}

export async function getPriceOracle(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [["Contracts", "PriceOracle"]]);
}

export async function getXVS(world: World, _venusArg: Event): Promise<XVS> {
  return getWorldContract(world, [["XVS", "address"]]);
}

export async function getXVSData(world: World, venusArg: string): Promise<[XVS, string, Map<string, string>]> {
  const contract = await getXVS(world, <Event>(<any>venusArg));
  const data = getContractData(world, [["XVS", venusArg]]);

  return [contract, venusArg, <Map<string, string>>(<any>data)];
}

export async function getSXP(world: World, _venusArg: Event): Promise<SXP> {
  return getWorldContract(world, [["SXP", "address"]]);
}

export async function getSXPData(world: World, venusArg: string): Promise<[SXP, string, Map<string, string>]> {
  const contract = await getSXP(world, <Event>(<any>venusArg));
  const data = getContractData(world, [["SXP", venusArg]]);

  return [contract, venusArg, <Map<string, string>>(<any>data)];
}

export async function getVAI(world: World): Promise<VAI> {
  return getWorldContract(world, [["VAI", "address"]]);
}

export async function getVAIData(world: World, venusArg: string): Promise<[VAI, string, Map<string, string>]> {
  const contract = await getVAI(world, <Event>(<any>venusArg));
  const data = getContractData(world, [["VAI", venusArg]]);

  return [contract, venusArg, <Map<string, string>>(<any>data)];
}

export async function getGovernorData(
  world: World,
  governorArg: string,
): Promise<[Governor, string, Map<string, string>]> {
  const contract = getWorldContract<Governor>(world, [["Governor", governorArg, "address"]]);
  const data = getContractData(world, [["Governor", governorArg]]);

  return [contract, governorArg, <Map<string, string>>(<any>data)];
}

export async function getInterestRateModel(world: World, interestRateModelArg: Event): Promise<InterestRateModel> {
  return getWorldContract(world, [["InterestRateModel", mustString(interestRateModelArg), "address"]]);
}

export async function getInterestRateModelData(
  world: World,
  interestRateModelArg: string,
): Promise<[InterestRateModel, string, Map<string, string>]> {
  const contract = await getInterestRateModel(world, <Event>(<any>interestRateModelArg));
  const data = getContractData(world, [["InterestRateModel", interestRateModelArg]]);

  return [contract, interestRateModelArg, <Map<string, string>>(<any>data)];
}

export async function getBep20Data(world: World, bep20Arg: string): Promise<[Bep20, string, Map<string, string>]> {
  const contract = getWorldContract<Bep20>(world, [["Tokens", bep20Arg, "address"]]);
  const data = getContractData(world, [["Tokens", bep20Arg]]);

  return [contract, bep20Arg, <Map<string, string>>(<any>data)];
}

export async function getVTokenData(world: World, vTokenArg: string): Promise<[VToken, string, Map<string, string>]> {
  const contract = getWorldContract<VToken>(world, [["vTokens", vTokenArg, "address"]]);
  const data = getContractData(world, [["VTokens", vTokenArg]]);

  return [contract, vTokenArg, <Map<string, string>>(<any>data)];
}

export async function getVTokenDelegateData(
  world: World,
  vTokenDelegateArg: string,
): Promise<[VBep20Delegate, string, Map<string, string>]> {
  const contract = getWorldContract<VBep20Delegate>(world, [["VTokenDelegate", vTokenDelegateArg, "address"]]);
  const data = getContractData(world, [["VTokenDelegate", vTokenDelegateArg]]);

  return [contract, vTokenDelegateArg, <Map<string, string>>(<any>data)];
}

export async function getComptrollerImplData(
  world: World,
  comptrollerImplArg: string,
): Promise<[ComptrollerImpl, string, Map<string, string>]> {
  const contract = await getComptrollerImpl(world, <Event>(<any>comptrollerImplArg));
  const data = getContractData(world, [["Comptroller", comptrollerImplArg]]);

  return [contract, comptrollerImplArg, <Map<string, string>>(<any>data)];
}

export async function getVAIControllerImplData(
  world: World,
  vaicontrollerImplArg: string,
): Promise<[VAIControllerImpl, string, Map<string, string>]> {
  const contract = await getComptrollerImpl(world, <Event>(<any>vaicontrollerImplArg));
  const data = getContractData(world, [["VAIController", vaicontrollerImplArg]]);

  return [contract, vaicontrollerImplArg, <Map<string, string>>(<any>data)];
}

export function getAddress(world: World, addressArg: string): string {
  if (addressArg.toLowerCase() === "zero") {
    return "0x0000000000000000000000000000000000000000";
  }

  if (addressArg.startsWith("0x")) {
    return addressArg;
  }

  const alias = Object.entries(world.settings.aliases).find(
    ([alias]) => alias.toLowerCase() === addressArg.toLowerCase(),
  );
  if (alias) {
    return alias[1];
  }

  const account = world.accounts.find(account => account.name.toLowerCase() === addressArg.toLowerCase());
  if (account) {
    return account.address;
  }

  return getContractDataString(world, [
    ["Contracts", addressArg],
    ["vTokens", addressArg, "address"],
    ["VTokenDelegate", addressArg, "address"],
    ["Tokens", addressArg, "address"],
    ["Comptroller", addressArg, "address"],
  ]);
}

export function getContractByName(world: World, name: string): Contract {
  return getWorldContract(world, [["Contracts", name]]);
}
