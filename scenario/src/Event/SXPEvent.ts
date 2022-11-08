import { buildSXP } from "../Builder/SXPBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { SXP, SXPScenario } from "../Contract/SXP";
import { getSXP } from "../ContractLookup";
import { getAddressV, getEventV, getNumberV, getStringV } from "../CoreValue";
import { NoErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { AddressV, EventV, NumberV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genSXP(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, sxp, tokenData } = await buildSXP(world, from, params);
  world = nextWorld;

  world = addAction(world, `Deployed SXP (${sxp.name}) to address ${sxp._address}`, tokenData.invokation);

  return world;
}

async function verifySXP(
  world: World,
  sxp: SXP,
  apiKey: string,
  modelName: string,
  contractName: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, sxp._address);
  }

  return world;
}

async function approve(world: World, from: string, sxp: SXP, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, sxp.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Approved SXP token for ${from} of ${amount.show()}`, invokation);

  return world;
}

async function transfer(world: World, from: string, sxp: SXP, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, sxp.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Transferred ${amount.show()} SXP tokens from ${from} to ${address}`, invokation);

  return world;
}

async function transferFrom(
  world: World,
  from: string,
  sxp: SXP,
  owner: string,
  spender: string,
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    sxp.methods.transferFrom(owner, spender, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `"Transferred from" ${amount.show()} SXP tokens from ${owner} to ${spender}`, invokation);

  return world;
}

async function transferScenario(
  world: World,
  from: string,
  sxp: SXPScenario,
  addresses: string[],
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    sxp.methods.transferScenario(addresses, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Transferred ${amount.show()} SXP tokens from ${from} to ${addresses}`, invokation);

  return world;
}

async function transferFromScenario(
  world: World,
  from: string,
  sxp: SXPScenario,
  addresses: string[],
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    sxp.methods.transferFromScenario(addresses, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Transferred ${amount.show()} SXP tokens from ${addresses} to ${from}`, invokation);

  return world;
}

async function delegate(world: World, from: string, sxp: SXP, account: string): Promise<World> {
  const invokation = await invoke(world, sxp.methods.delegate(account), from, NoErrorReporter);

  world = addAction(world, `"Delegated from" ${from} to ${account}`, invokation);

  return world;
}

async function setBlockNumber(world: World, from: string, sxp: SXP, blockNumber: NumberV): Promise<World> {
  return addAction(
    world,
    `Set SXP blockNumber to ${blockNumber.show()}`,
    await invoke(world, sxp.methods.setBlockNumber(blockNumber.encode()), from),
  );
}

export function sxpCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new SXP token
          * E.g. "SXP Deploy"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genSXP(world, from, params.val),
    ),

    new View<{ sxp: SXP; apiKey: StringV; contractName: StringV }>(
      `
        #### Verify

        * "<SXP> Verify apiKey:<String> contractName:<String>=SXP" - Verifies SXP token in BscScan
          * E.g. "SXP Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("sxp", getSXP, { implicit: true }),
        new Arg("apiKey", getStringV),
        new Arg("contractName", getStringV, { default: new StringV("SXP") }),
      ],
      async (world, { sxp, apiKey, contractName }) => {
        return await verifySXP(world, sxp, apiKey.val, sxp.name, contractName.val);
      },
    ),

    new Command<{ sxp: SXP; spender: AddressV; amount: NumberV }>(
      `
        #### Approve

        * "SXP Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "SXP Approve Geoff 1.0e18"
      `,
      "Approve",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("spender", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { sxp, spender, amount }) => {
        return approve(world, from, sxp, spender.val, amount);
      },
    ),

    new Command<{ sxp: SXP; recipient: AddressV; amount: NumberV }>(
      `
        #### Transfer

        * "SXP Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "SXP Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("recipient", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { sxp, recipient, amount }) => transfer(world, from, sxp, recipient.val, amount),
    ),

    new Command<{ sxp: SXP; owner: AddressV; spender: AddressV; amount: NumberV }>(
      `
        #### TransferFrom

        * "SXP TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "SXP TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("sxp", getSXP, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { sxp, owner, spender, amount }) => transferFrom(world, from, sxp, owner.val, spender.val, amount),
    ),

    new Command<{ sxp: SXPScenario; recipients: AddressV[]; amount: NumberV }>(
      `
        #### TransferScenario

        * "SXP TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "SXP TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("sxp", getSXP, { implicit: true }),
        new Arg("recipients", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { sxp, recipients, amount }) =>
        transferScenario(
          world,
          from,
          sxp,
          recipients.map(recipient => recipient.val),
          amount,
        ),
    ),

    new Command<{ sxp: SXPScenario; froms: AddressV[]; amount: NumberV }>(
      `
        #### TransferFromScenario

        * "SXP TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "SXP TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("sxp", getSXP, { implicit: true }),
        new Arg("froms", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { sxp, froms, amount }) =>
        transferFromScenario(
          world,
          from,
          sxp,
          froms.map(_from => _from.val),
          amount,
        ),
    ),

    new Command<{ sxp: SXP; account: AddressV }>(
      `
        #### Delegate

        * "SXP Delegate account:<Address>" - Delegates votes to a given account
          * E.g. "SXP Delegate Torrey"
      `,
      "Delegate",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("account", getAddressV)],
      (world, from, { sxp, account }) => delegate(world, from, sxp, account.val),
    ),
    new Command<{ sxp: SXP; blockNumber: NumberV }>(
      `
      #### SetBlockNumber

      * "SetBlockNumber <Seconds>" - Sets the blockTimestamp of the SXP Harness
      * E.g. "SXP SetBlockNumber 500"
      `,
      "SetBlockNumber",
      [new Arg("sxp", getSXP, { implicit: true }), new Arg("blockNumber", getNumberV)],
      (world, from, { sxp, blockNumber }) => setBlockNumber(world, from, sxp, blockNumber),
    ),
  ];
}

export async function processSXPEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("SXP", sxpCommands(), world, event, from);
}
