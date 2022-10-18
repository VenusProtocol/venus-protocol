import { Arg, Fetcher, getFetcherValue } from "../Command";
import { VAI } from "../Contract/VAI";
import { getVAI } from "../ContractLookup";
import { getAddressV } from "../CoreValue";
import { Event } from "../Event";
import { AddressV, NumberV, StringV, Value } from "../Value";
import { World } from "../World";

export function vaiFetchers() {
  return [
    new Fetcher<{ vai: VAI }, AddressV>(
      `
        #### Address

        * "<VAI> Address" - Returns the address of VAI token
          * E.g. "VAI Address"
      `,
      "Address",
      [new Arg("vai", getVAI, { implicit: true })],
      async (world, { vai }) => new AddressV(vai._address),
    ),

    new Fetcher<{ vai: VAI }, StringV>(
      `
        #### Name

        * "<VAI> Name" - Returns the name of the VAI token
          * E.g. "VAI Name"
      `,
      "Name",
      [new Arg("vai", getVAI, { implicit: true })],
      async (world, { vai }) => new StringV(await vai.methods.name().call()),
    ),

    new Fetcher<{ vai: VAI }, StringV>(
      `
        #### Symbol

        * "<VAI> Symbol" - Returns the symbol of the VAI token
          * E.g. "VAI Symbol"
      `,
      "Symbol",
      [new Arg("vai", getVAI, { implicit: true })],
      async (world, { vai }) => new StringV(await vai.methods.symbol().call()),
    ),

    new Fetcher<{ vai: VAI }, NumberV>(
      `
        #### Decimals

        * "<VAI> Decimals" - Returns the number of decimals of the VAI token
          * E.g. "VAI Decimals"
      `,
      "Decimals",
      [new Arg("vai", getVAI, { implicit: true })],
      async (world, { vai }) => new NumberV(await vai.methods.decimals().call()),
    ),

    new Fetcher<{ vai: VAI }, NumberV>(
      `
        #### TotalSupply

        * "VAI TotalSupply" - Returns VAI token's total supply
      `,
      "TotalSupply",
      [new Arg("vai", getVAI, { implicit: true })],
      async (world, { vai }) => new NumberV(await vai.methods.totalSupply().call()),
    ),

    new Fetcher<{ vai: VAI; address: AddressV }, NumberV>(
      `
        #### TokenBalance

        * "VAI TokenBalance <Address>" - Returns the VAI token balance of a given address
          * E.g. "VAI TokenBalance Geoff" - Returns Geoff's VAI balance
      `,
      "TokenBalance",
      [new Arg("vai", getVAI, { implicit: true }), new Arg("address", getAddressV)],
      async (world, { vai, address }) => new NumberV(await vai.methods.balanceOf(address.val).call()),
    ),

    new Fetcher<{ vai: VAI; owner: AddressV; spender: AddressV }, NumberV>(
      `
        #### Allowance

        * "VAI Allowance owner:<Address> spender:<Address>" - Returns the VAI allowance from owner to spender
          * E.g. "VAI Allowance Geoff Torrey" - Returns the VAI allowance of Geoff to Torrey
      `,
      "Allowance",
      [new Arg("vai", getVAI, { implicit: true }), new Arg("owner", getAddressV), new Arg("spender", getAddressV)],
      async (world, { vai, owner, spender }) => new NumberV(await vai.methods.allowance(owner.val, spender.val).call()),
    ),
  ];
}

export async function getVAIValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("VAI", vaiFetchers(), world, event);
}
