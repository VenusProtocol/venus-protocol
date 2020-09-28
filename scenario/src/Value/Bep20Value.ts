import {Event} from '../Event';
import {World} from '../World';
import {Bep20} from '../Contract/Bep20';
import {getBep20Address, getWorldContractByAddress} from '../ContractLookup';
import {
  getAddressV,
  getCoreValue,
  mapValue,
} from '../CoreValue';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {
  AddressV,
  NumberV,
  Value,
  StringV
} from '../Value';

export async function getBep20Name(world: World, erc20: Bep20): Promise<StringV> {
  return new StringV(await erc20.methods.name().call());
}

export async function getBep20Symbol(world: World, erc20: Bep20): Promise<StringV> {
  return new StringV(await erc20.methods.symbol().call());
}

export async function getBep20Decimals(world: World, erc20: Bep20): Promise<NumberV> {
  return new NumberV(await erc20.methods.decimals().call());
}

async function getTotalSupply(world: World, erc20: Bep20): Promise<NumberV> {
  return new NumberV(await erc20.methods.totalSupply().call());
}

async function getTokenBalance(world: World, erc20: Bep20, address: string): Promise<NumberV> {
  return new NumberV(await erc20.methods.balanceOf(address).call());
}

async function getAllowance(world: World, erc20: Bep20, owner: string, spender: string): Promise<NumberV> {
  return new NumberV(await erc20.methods.allowance(owner, spender).call());
}

export async function getBep20V(world: World, event: Event): Promise<Bep20> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getBep20Address(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<Bep20>(world, address.val);
}

export function erc20Fetchers() {
  return [
    new Fetcher<{erc20: Bep20}, AddressV>(`
        #### Address

        * "Bep20 <Bep20> Address" - Returns address of BEP-20 contract
          * E.g. "Bep20 ZRX Address" - Returns ZRX's address
      `,
      "Address",
      [
        new Arg("erc20", getBep20V)
      ],
      async (world, {erc20}) => new AddressV(erc20._address),
      {namePos: 1}
    ),
    new Fetcher<{erc20: Bep20}, StringV>(`
        #### Name

        * "Bep20 <Bep20> Name" - Returns name of BEP-20 contract
          * E.g. "Bep20 ZRX Name" - Returns ZRX's name
      `,
      "Name",
      [
        new Arg("erc20", getBep20V)
      ],
      (world, {erc20}) => getBep20Name(world, erc20),
      {namePos: 1}
    ),
    new Fetcher<{erc20: Bep20}, StringV>(`
        #### Symbol

        * "Bep20 <Bep20> Symbol" - Returns symbol of BEP-20 contract
          * E.g. "Bep20 ZRX Symbol" - Returns ZRX's symbol
      `,
      "Symbol",
      [
        new Arg("erc20", getBep20V)
      ],
      (world, {erc20}) => getBep20Symbol(world, erc20),
      {namePos: 1}
    ),
    new Fetcher<{erc20: Bep20}, NumberV>(`
        #### Decimals

        * "Bep20 <Bep20> Decimals" - Returns number of decimals in BEP-20 contract
          * E.g. "Bep20 ZRX Decimals" - Returns ZRX's decimals
      `,
      "Decimals",
      [
        new Arg("erc20", getBep20V)
      ],
      (world, {erc20}) => getBep20Decimals(world, erc20),
      {namePos: 1}
    ),
    new Fetcher<{erc20: Bep20}, NumberV>(`
        #### TotalSupply

        * "Bep20 <Bep20> TotalSupply" - Returns the BEP-20 token's total supply
          * E.g. "Bep20 ZRX TotalSupply"
          * E.g. "Bep20 vZRX TotalSupply"
      `,
      "TotalSupply",
      [
        new Arg("erc20", getBep20V)
      ],
      (world, {erc20}) => getTotalSupply(world, erc20),
      {namePos: 1}
    ),
    new Fetcher<{erc20: Bep20, address: AddressV}, NumberV>(`
        #### TokenBalance

        * "Bep20 <Bep20> TokenBalance <Address>" - Returns the BEP-20 token balance of a given address
          * E.g. "Bep20 ZRX TokenBalance Geoff" - Returns a user's ZRX balance
          * E.g. "Bep20 vZRX TokenBalance Geoff" - Returns a user's vZRX balance
          * E.g. "Bep20 ZRX TokenBalance vZRX" - Returns vZRX's ZRX balance
      `,
      "TokenBalance",
      [
        new Arg("erc20", getBep20V),
        new Arg("address", getAddressV)
      ],
      (world, {erc20, address}) => getTokenBalance(world, erc20, address.val),
      {namePos: 1}
    ),
    new Fetcher<{erc20: Bep20, owner: AddressV, spender: AddressV}, NumberV>(`
        #### Allowance

        * "Bep20 <Bep20> Allowance owner:<Address> spender:<Address>" - Returns the BEP-20 allowance from owner to spender
          * E.g. "Bep20 ZRX Allowance Geoff Torrey" - Returns the ZRX allowance of Geoff to Torrey
          * E.g. "Bep20 vZRX Allowance Geoff Coburn" - Returns the vZRX allowance of Geoff to Coburn
          * E.g. "Bep20 ZRX Allowance Geoff vZRX" - Returns the ZRX allowance of Geoff to the vZRX vToken
      `,
      "Allowance",
      [
        new Arg("erc20", getBep20V),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV)
      ],
      (world, {erc20, owner, spender}) => getAllowance(world, erc20, owner.val, spender.val),
      {namePos: 1}
    )
  ];
}

export async function getBep20Value(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Bep20", erc20Fetchers(), world, event);
}
