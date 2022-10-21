import { Arg, Fetcher, getFetcherValue } from "../Command";
import { SXP } from "../Contract/SXP";
import { getSXP } from "../ContractLookup";
import { getAddressV, getNumberV } from "../CoreValue";
import { Event } from "../Event";
import { AddressV, ListV, NumberV, StringV, Value } from "../Value";
import { World } from "../World";

export function sxpFetchers() {
  return [
    new Fetcher<{ sxp: SXP }, AddressV>(
      `
        #### Address

        * "<SXP> Address" - Returns the address of SXP token
          * E.g. "SXP Address"
      `,
      "Address",
      [new Arg("sxp", getSXP, { implicit: true })],
      async (world, { sxp }) => new AddressV(sxp._address),
    ),

    new Fetcher<{ sxp: SXP }, StringV>(
      `
        #### Name

        * "<SXP> Name" - Returns the name of the SXP token
          * E.g. "SXP Name"
      `,
      "Name",
      [new Arg("sxp", getSXP, { implicit: true })],
      async (world, { sxp }) => new StringV(await sxp.methods.name().call()),
    ),

    new Fetcher<{ sxp: SXP }, StringV>(
      `
        #### Symbol

        * "<SXP> Symbol" - Returns the symbol of the SXP token
          * E.g. "SXP Symbol"
      `,
      "Symbol",
      [new Arg("sxp", getSXP, { implicit: true })],
      async (world, { sxp }) => new StringV(await sxp.methods.symbol().call()),
    ),

    new Fetcher<{ sxp: SXP }, NumberV>(
      `
        #### Decimals

        * "<SXP> Decimals" - Returns the number of decimals of the SXP token
          * E.g. "SXP Decimals"
      `,
      "Decimals",
      [new Arg("sxp", getSXP, { implicit: true })],
      async (world, { sxp }) => new NumberV(await sxp.methods.decimals().call()),
    ),

    new Fetcher<{ sxp: SXP }, NumberV>(
      `
        #### TotalSupply

        * "SXP TotalSupply" - Returns SXP token's total supply
      `,
      "TotalSupply",
      [new Arg("sxp", getSXP, { implicit: true })],
      async (world, { sxp }) => new NumberV(await sxp.methods.totalSupply().call()),
    ),

    new Fetcher<{ sxp: SXP; address: AddressV }, NumberV>(
      `
        #### TokenBalance

        * "SXP TokenBalance <Address>" - Returns the SXP token balance of a given address
          * E.g. "SXP TokenBalance Geoff" - Returns Geoff's SXP balance
      `,
      "TokenBalance",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("address", getAddressV)],
      async (world, { sxp, address }) => new NumberV(await sxp.methods.balanceOf(address.val).call()),
    ),

    new Fetcher<{ sxp: SXP; owner: AddressV; spender: AddressV }, NumberV>(
      `
        #### Allowance

        * "SXP Allowance owner:<Address> spender:<Address>" - Returns the SXP allowance from owner to spender
          * E.g. "SXP Allowance Geoff Torrey" - Returns the SXP allowance of Geoff to Torrey
      `,
      "Allowance",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("owner", getAddressV), new Arg("spender", getAddressV)],
      async (world, { sxp, owner, spender }) => new NumberV(await sxp.methods.allowance(owner.val, spender.val).call()),
    ),

    new Fetcher<{ sxp: SXP; account: AddressV }, NumberV>(
      `
        #### GetCurrentVotes

        * "SXP GetCurrentVotes account:<Address>" - Returns the current SXP votes balance for an account
          * E.g. "SXP GetCurrentVotes Geoff" - Returns the current SXP vote balance of Geoff
      `,
      "GetCurrentVotes",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("account", getAddressV)],
      async (world, { sxp, account }) => new NumberV(await sxp.methods.getCurrentVotes(account.val).call()),
    ),

    new Fetcher<{ sxp: SXP; account: AddressV; blockNumber: NumberV }, NumberV>(
      `
        #### GetPriorVotes

        * "SXP GetPriorVotes account:<Address> blockBumber:<Number>" - Returns the current SXP votes balance at given block
          * E.g. "SXP GetPriorVotes Geoff 5" - Returns the SXP vote balance for Geoff at block 5
      `,
      "GetPriorVotes",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("account", getAddressV), new Arg("blockNumber", getNumberV)],
      async (world, { sxp, account, blockNumber }) =>
        new NumberV(await sxp.methods.getPriorVotes(account.val, blockNumber.encode()).call()),
    ),

    new Fetcher<{ sxp: SXP; account: AddressV }, NumberV>(
      `
        #### GetCurrentVotesBlock

        * "SXP GetCurrentVotesBlock account:<Address>" - Returns the current SXP votes checkpoint block for an account
          * E.g. "SXP GetCurrentVotesBlock Geoff" - Returns the current SXP votes checkpoint block for Geoff
      `,
      "GetCurrentVotesBlock",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("account", getAddressV)],
      async (world, { sxp, account }) => {
        const numCheckpoints = Number(await sxp.methods.numCheckpoints(account.val).call());
        const checkpoint = await sxp.methods.checkpoints(account.val, numCheckpoints - 1).call();

        return new NumberV(checkpoint.fromBlock);
      },
    ),

    new Fetcher<{ sxp: SXP; account: AddressV }, NumberV>(
      `
        #### VotesLength

        * "SXP VotesLength account:<Address>" - Returns the SXP vote checkpoint array length
          * E.g. "SXP VotesLength Geoff" - Returns the SXP vote checkpoint array length of Geoff
      `,
      "VotesLength",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("account", getAddressV)],
      async (world, { sxp, account }) => new NumberV(await sxp.methods.numCheckpoints(account.val).call()),
    ),

    new Fetcher<{ sxp: SXP; account: AddressV }, ListV>(
      `
        #### AllVotes

        * "SXP AllVotes account:<Address>" - Returns information about all votes an account has had
          * E.g. "SXP AllVotes Geoff" - Returns the SXP vote checkpoint array
      `,
      "AllVotes",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("account", getAddressV)],
      async (world, { sxp, account }) => {
        const numCheckpoints = Number(await sxp.methods.numCheckpoints(account.val).call());
        const checkpoints = await Promise.all(
          new Array(numCheckpoints).fill(undefined).map(async (_, i) => {
            const { fromBlock, votes } = await sxp.methods.checkpoints(account.val, i).call();

            return new StringV(`Block ${fromBlock}: ${votes} vote${votes !== 1 ? "s" : ""}`);
          }),
        );

        return new ListV(checkpoints);
      },
    ),
  ];
}

export async function getSXPValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("SXP", sxpFetchers(), world, event);
}
