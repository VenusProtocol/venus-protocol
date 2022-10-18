import { Arg, Fetcher, getFetcherValue } from "../Command";
import { VBep20Delegate } from "../Contract/VBep20Delegate";
import { getVTokenDelegateAddress, getWorldContractByAddress } from "../ContractLookup";
import { getCoreValue, mapValue } from "../CoreValue";
import { Event } from "../Event";
import { AddressV, Value } from "../Value";
import { World } from "../World";

export async function getVTokenDelegateV(world: World, event: Event): Promise<VBep20Delegate> {
  const address = await mapValue<AddressV>(
    world,
    event,
    str => new AddressV(getVTokenDelegateAddress(world, str)),
    getCoreValue,
    AddressV,
  );

  return getWorldContractByAddress<VBep20Delegate>(world, address.val);
}

async function vTokenDelegateAddress(world: World, vTokenDelegate: VBep20Delegate): Promise<AddressV> {
  return new AddressV(vTokenDelegate._address);
}

export function vTokenDelegateFetchers() {
  return [
    new Fetcher<{ vTokenDelegate: VBep20Delegate }, AddressV>(
      `
        #### Address

        * "VTokenDelegate <VTokenDelegate> Address" - Returns address of VTokenDelegate contract
          * E.g. "VTokenDelegate vDaiDelegate Address" - Returns vDaiDelegate's address
      `,
      "Address",
      [new Arg("vTokenDelegate", getVTokenDelegateV)],
      (world, { vTokenDelegate }) => vTokenDelegateAddress(world, vTokenDelegate),
      { namePos: 1 },
    ),
  ];
}

export async function getVTokenDelegateValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("VTokenDelegate", vTokenDelegateFetchers(), world, event);
}
