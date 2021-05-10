import {Event} from '../Event';
import {World} from '../World';
import {VAIController} from '../Contract/VAIController';
import {
  getAddressV,
  getCoreValue,
  getStringV,
  getNumberV
} from '../CoreValue';
import {
  AddressV,
  BoolV,
  ListV,
  NumberV,
  StringV,
  Value
} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getVAIController} from '../ContractLookup';
import {encodedNumber} from '../Encoding';
import {getVTokenV} from './VTokenValue';
import { encodeParameters, encodeABI } from '../Utils';

export async function getVAIControllerAddress(world: World, vaicontroller: VAIController): Promise<AddressV> {
  return new AddressV(vaicontroller._address);
}

async function getMintableVAI(world: World, vaicontroller: VAIController, account: string): Promise<NumberV> {
  let {0: error, 1: amount} = await vaicontroller.methods.getMintableVAI(account).call();
  if (Number(error) != 0) {
    throw new Error(`Failed to get mintable vai: error code = ${error}`);
  }
  return new NumberV(Number(amount));
}

async function getAdmin(world: World, vaicontroller: VAIController): Promise<AddressV> {
  return new AddressV(await vaicontroller.methods.admin().call());
}

async function getPendingAdmin(world: World, vaicontroller: VAIController): Promise<AddressV> {
  return new AddressV(await vaicontroller.methods.pendingAdmin().call());
}

async function getMintCappedAmount(world: World, vaicontroller: VAIController): Promise<NumberV> {
  return new NumberV(await vaicontroller.methods.mintCappedAmount().call());
}


export function vaicontrollerFetchers() {
  return [
    new Fetcher<{vaicontroller: VAIController}, AddressV>(`
        #### Address

        * "VAIController Address" - Returns address of vaicontroller
      `,
      "Address",
      [new Arg("vaicontroller", getVAIController, {implicit: true})],
      (world, {vaicontroller}) => getVAIControllerAddress(world, vaicontroller)
    ),
    new Fetcher<{vaicontroller: VAIController, account: AddressV}, NumberV>(`
        #### MintableVAI

        * "VAIController MintableVAI <User>" - Returns a given user's mintable vai amount
          * E.g. "VAIController MintableVAI Geoff"
      `,
      "MintableVAI",
      [
        new Arg("vaicontroller", getVAIController, {implicit: true}),
        new Arg("account", getAddressV)
      ],
      (world, {vaicontroller, account}) => getMintableVAI(world, vaicontroller, account.val)
    ),
    new Fetcher<{vaicontroller: VAIController}, AddressV>(`
        #### Admin

        * "VAIController Admin" - Returns the VAIControllers's admin
          * E.g. "VAIController Admin"
      `,
      "Admin",
      [new Arg("vaicontroller", getVAIController, {implicit: true})],
      (world, {vaicontroller}) => getAdmin(world, vaicontroller)
    ),
    new Fetcher<{vaicontroller: VAIController}, AddressV>(`
        #### PendingAdmin

        * "VAIController PendingAdmin" - Returns the pending admin of the VAIController
          * E.g. "VAIController PendingAdmin" - Returns VAIController's pending admin
      `,
      "PendingAdmin",
      [
        new Arg("vaicontroller", getVAIController, {implicit: true}),
      ],
      (world, {vaicontroller}) => getPendingAdmin(world, vaicontroller)
    ),
    new Fetcher<{vaicontroller: VAIController}, NumberV>(`
        #### MintCappedAmount

        * "VAIController MintCappedAmount" - Returns the mintCappedAmount of VAIController
          * E.g. "VAIController MintCappedAmount"
      `,
      "MintCappedAmount",
      [new Arg("vaicontroller", getVAIController, {implicit: true})],
      (world, {vaicontroller}) => getMintCappedAmount(world, vaicontroller)
    ),
  ];
}

export async function getVAIControllerValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("VAIController", vaicontrollerFetchers(), world, event);
}
