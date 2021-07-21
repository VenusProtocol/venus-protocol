import { Map } from 'immutable';

import { Event } from './Event';
import { World } from './World';
import { accountMap } from './Accounts';
import { Contract } from './Contract';
import { mustString } from './Utils';

import { VBep20Delegate } from './Contract/VBep20Delegate';
import { XVS } from './Contract/XVS';
import { SXP } from './Contract/SXP';
import { VAI } from './Contract/VAI';
import { Comptroller } from './Contract/Comptroller';
import { ComptrollerImpl } from './Contract/ComptrollerImpl';
import { VAIController } from './Contract/VAIController';
import { VAIControllerImpl } from './Contract/VAIControllerImpl';
import { VToken } from './Contract/VToken';
import { Governor } from './Contract/Governor';
import { GovernorBravo } from './Contract/GovernorBravo'
import { Bep20 } from './Contract/Bep20';
import { InterestRateModel } from './Contract/InterestRateModel';
import { PriceOracle } from './Contract/PriceOracle';
import { Timelock } from './Contract/Timelock';

type ContractDataEl = string | Map<string, object> | undefined;

function getContractData(world: World, indices: string[][]): ContractDataEl {
  return indices.reduce((value: ContractDataEl, index) => {
    if (value) {
      return value;
    } else {
      return index.reduce((data: ContractDataEl, el) => {
        let lowerEl = el.toLowerCase();

        if (!data) {
          return;
        } else if (typeof data === 'string') {
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

  if (!value || typeof value !== 'string') {
    throw new Error(
      `Failed to find string value by index (got ${value}): ${JSON.stringify(
        indices
      )}, index contains: ${JSON.stringify(world.contractData.toJSON())}`
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
        Object.keys(world.contractIndex)
      )}`
    );
  }

  return <T>(<unknown>contract);
}

export async function getTimelock(world: World): Promise<Timelock> {
  return getWorldContract(world, [['Contracts', 'Timelock']]);
}

export async function getUnitroller(world: World): Promise<Comptroller> {
  return getWorldContract(world, [['Contracts', 'Unitroller']]);
}

export async function getVAIUnitroller(world: World): Promise<VAIController> {
  return getWorldContract(world, [['Contracts', 'VAIUnitroller']]);
}

export async function getMaximillion(world: World): Promise<Comptroller> {
  return getWorldContract(world, [['Contracts', 'Maximillion']]);
}

export async function getComptroller(world: World): Promise<Comptroller> {
  return getWorldContract(world, [['Contracts', 'Comptroller']]);
}

export async function getComptrollerImpl(world: World, comptrollerImplArg: Event): Promise<ComptrollerImpl> {
  return getWorldContract(world, [['Comptroller', mustString(comptrollerImplArg), 'address']]);
}

export async function getVAIController(world: World): Promise<VAIController> {
  return getWorldContract(world, [['Contracts', 'VAIController']]);
}

export async function getVAIControllerImpl(world: World, vaicontrollerImplArg: Event): Promise<VAIControllerImpl> {
  return getWorldContract(world, [['VAIController', mustString(vaicontrollerImplArg), 'address']]);
}

export function getVTokenAddress(world: World, vTokenArg: string): string {
  return getContractDataString(world, [['vTokens', vTokenArg, 'address']]);
}

export function getVTokenDelegateAddress(world: World, vTokenDelegateArg: string): string {
  return getContractDataString(world, [['VTokenDelegate', vTokenDelegateArg, 'address']]);
}

export function getBep20Address(world: World, bep20Arg: string): string {
  return getContractDataString(world, [['Tokens', bep20Arg, 'address']]);
}

export function getGovernorAddress(world: World, governorArg: string): string {
  return getContractDataString(world, [['Contracts', governorArg]]);
}

export function getGovernorBravo(world: World, governoBravoArg: string): Promise<GovernorBravo> {
  return getWorldContract(world, [['Contracts', 'GovernorBravo']])
}

export async function getPriceOracleProxy(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [['Contracts', 'PriceOracleProxy']]);
}

export async function getPriceOracle(world: World): Promise<PriceOracle> {
  return getWorldContract(world, [['Contracts', 'PriceOracle']]);
}

export async function getXVS(
  world: World,
  venusArg: Event
): Promise<XVS> {
  return getWorldContract(world, [['XVS', 'address']]);
}

export async function getXVSData(
  world: World,
  venusArg: string
): Promise<[XVS, string, Map<string, string>]> {
  let contract = await getXVS(world, <Event>(<any>venusArg));
  let data = getContractData(world, [['XVS', venusArg]]);

  return [contract, venusArg, <Map<string, string>>(<any>data)];
}

export async function getSXP(
  world: World,
  venusArg: Event
): Promise<SXP> {
  return getWorldContract(world, [['SXP', 'address']]);
}

export async function getSXPData(
  world: World,
  venusArg: string
): Promise<[SXP, string, Map<string, string>]> {
  let contract = await getSXP(world, <Event>(<any>venusArg));
  let data = getContractData(world, [['SXP', venusArg]]);

  return [contract, venusArg, <Map<string, string>>(<any>data)];
}

export async function getVAI(
  world: World,
  venusArg: Event
): Promise<VAI> {
  return getWorldContract(world, [['VAI', 'address']]);
}

export async function getVAIData(
  world: World,
  venusArg: string
): Promise<[VAI, string, Map<string, string>]> {
  let contract = await getVAI(world, <Event>(<any>venusArg));
  let data = getContractData(world, [['VAI', venusArg]]);

  return [contract, venusArg, <Map<string, string>>(<any>data)];
}

export async function getGovernorData(
  world: World,
  governorArg: string
): Promise<[Governor, string, Map<string, string>]> {
  let contract = getWorldContract<Governor>(world, [['Governor', governorArg, 'address']]);
  let data = getContractData(world, [['Governor', governorArg]]);

  return [contract, governorArg, <Map<string, string>>(<any>data)];
}

export async function getInterestRateModel(
  world: World,
  interestRateModelArg: Event
): Promise<InterestRateModel> {
  return getWorldContract(world, [['InterestRateModel', mustString(interestRateModelArg), 'address']]);
}

export async function getInterestRateModelData(
  world: World,
  interestRateModelArg: string
): Promise<[InterestRateModel, string, Map<string, string>]> {
  let contract = await getInterestRateModel(world, <Event>(<any>interestRateModelArg));
  let data = getContractData(world, [['InterestRateModel', interestRateModelArg]]);

  return [contract, interestRateModelArg, <Map<string, string>>(<any>data)];
}

export async function getBep20Data(
  world: World,
  bep20Arg: string
): Promise<[Bep20, string, Map<string, string>]> {
  let contract = getWorldContract<Bep20>(world, [['Tokens', bep20Arg, 'address']]);
  let data = getContractData(world, [['Tokens', bep20Arg]]);

  return [contract, bep20Arg, <Map<string, string>>(<any>data)];
}

export async function getVTokenData(
  world: World,
  vTokenArg: string
): Promise<[VToken, string, Map<string, string>]> {
  let contract = getWorldContract<VToken>(world, [['vTokens', vTokenArg, 'address']]);
  let data = getContractData(world, [['VTokens', vTokenArg]]);

  return [contract, vTokenArg, <Map<string, string>>(<any>data)];
}

export async function getVTokenDelegateData(
  world: World,
  vTokenDelegateArg: string
): Promise<[VBep20Delegate, string, Map<string, string>]> {
  let contract = getWorldContract<VBep20Delegate>(world, [['VTokenDelegate', vTokenDelegateArg, 'address']]);
  let data = getContractData(world, [['VTokenDelegate', vTokenDelegateArg]]);

  return [contract, vTokenDelegateArg, <Map<string, string>>(<any>data)];
}

export async function getComptrollerImplData(
  world: World,
  comptrollerImplArg: string
): Promise<[ComptrollerImpl, string, Map<string, string>]> {
  let contract = await getComptrollerImpl(world, <Event>(<any>comptrollerImplArg));
  let data = getContractData(world, [['Comptroller', comptrollerImplArg]]);

  return [contract, comptrollerImplArg, <Map<string, string>>(<any>data)];
}

export async function getVAIControllerImplData(
  world: World,
  vaicontrollerImplArg: string
): Promise<[VAIControllerImpl, string, Map<string, string>]> {
  let contract = await getComptrollerImpl(world, <Event>(<any>vaicontrollerImplArg));
  let data = getContractData(world, [['VAIController', vaicontrollerImplArg]]);

  return [contract, vaicontrollerImplArg, <Map<string, string>>(<any>data)];
}

export function getAddress(world: World, addressArg: string): string {
  if (addressArg.toLowerCase() === 'zero') {
    return '0x0000000000000000000000000000000000000000';
  }

  if (addressArg.startsWith('0x')) {
    return addressArg;
  }

  let alias = Object.entries(world.settings.aliases).find(
    ([alias, addr]) => alias.toLowerCase() === addressArg.toLowerCase()
  );
  if (alias) {
    return alias[1];
  }

  let account = world.accounts.find(account => account.name.toLowerCase() === addressArg.toLowerCase());
  if (account) {
    return account.address;
  }

  return getContractDataString(world, [
    ['Contracts', addressArg],
    ['vTokens', addressArg, 'address'],
    ['VTokenDelegate', addressArg, 'address'],
    ['Tokens', addressArg, 'address'],
    ['Comptroller', addressArg, 'address']
  ]);
}

export function getContractByName(world: World, name: string): Contract {
  return getWorldContract(world, [['Contracts', name]]);
}
