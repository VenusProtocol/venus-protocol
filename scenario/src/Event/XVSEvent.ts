import { buildXVS } from "../Builder/XVSBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { XVS, XVSScenario } from "../Contract/XVS";
import { getXVS } from "../ContractLookup";
import { getAddressV, getEventV, getNumberV, getStringV } from "../CoreValue";
import { NoErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { AddressV, EventV, NumberV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genXVS(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, xvs, tokenData } = await buildXVS(world, from, params);
  world = nextWorld;

  world = addAction(world, `Deployed XVS (${xvs.name}) to address ${xvs._address}`, tokenData.invokation);

  return world;
}

async function verifyXVS(
  world: World,
  xvs: XVS,
  apiKey: string,
  modelName: string,
  contractName: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, xvs._address);
  }

  return world;
}

async function approve(world: World, from: string, xvs: XVS, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, xvs.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Approved XVS token for ${from} of ${amount.show()}`, invokation);

  return world;
}

async function transfer(world: World, from: string, xvs: XVS, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, xvs.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Transferred ${amount.show()} XVS tokens from ${from} to ${address}`, invokation);

  return world;
}

async function transferFrom(
  world: World,
  from: string,
  xvs: XVS,
  owner: string,
  spender: string,
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvs.methods.transferFrom(owner, spender, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `"Transferred from" ${amount.show()} XVS tokens from ${owner} to ${spender}`, invokation);

  return world;
}

async function transferScenario(
  world: World,
  from: string,
  xvs: XVSScenario,
  addresses: string[],
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvs.methods.transferScenario(addresses, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Transferred ${amount.show()} XVS tokens from ${from} to ${addresses}`, invokation);

  return world;
}

async function transferFromScenario(
  world: World,
  from: string,
  xvs: XVSScenario,
  addresses: string[],
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    xvs.methods.transferFromScenario(addresses, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Transferred ${amount.show()} XVS tokens from ${addresses} to ${from}`, invokation);

  return world;
}

async function delegate(world: World, from: string, xvs: XVS, account: string): Promise<World> {
  const invokation = await invoke(world, xvs.methods.delegate(account), from, NoErrorReporter);

  world = addAction(world, `"Delegated from" ${from} to ${account}`, invokation);

  return world;
}

async function setBlockNumber(world: World, from: string, xvs: XVS, blockNumber: NumberV): Promise<World> {
  return addAction(
    world,
    `Set XVS blockNumber to ${blockNumber.show()}`,
    await invoke(world, xvs.methods.setBlockNumber(blockNumber.encode()), from),
  );
}

export function xvsCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new XVS token
          * E.g. "XVS Deploy"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genXVS(world, from, params.val),
    ),

    new View<{ xvs: XVS; apiKey: StringV; contractName: StringV }>(
      `
        #### Verify

        * "<XVS> Verify apiKey:<String> contractName:<String>=XVS" - Verifies XVS token in BscScan
          * E.g. "XVS Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("xvs", getXVS, { implicit: true }),
        new Arg("apiKey", getStringV),
        new Arg("contractName", getStringV, { default: new StringV("XVS") }),
      ],
      async (world, { xvs, apiKey, contractName }) => {
        return await verifyXVS(world, xvs, apiKey.val, xvs.name, contractName.val);
      },
    ),

    new Command<{ xvs: XVS; spender: AddressV; amount: NumberV }>(
      `
        #### Approve

        * "XVS Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "XVS Approve Geoff 1.0e18"
      `,
      "Approve",
      [new Arg("xvs", getXVS, { implicit: true }), new Arg("spender", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { xvs, spender, amount }) => {
        return approve(world, from, xvs, spender.val, amount);
      },
    ),

    new Command<{ xvs: XVS; recipient: AddressV; amount: NumberV }>(
      `
        #### Transfer

        * "XVS Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "XVS Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [new Arg("xvs", getXVS, { implicit: true }), new Arg("recipient", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { xvs, recipient, amount }) => transfer(world, from, xvs, recipient.val, amount),
    ),

    new Command<{ xvs: XVS; owner: AddressV; spender: AddressV; amount: NumberV }>(
      `
        #### TransferFrom

        * "XVS TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "XVS TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("xvs", getXVS, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { xvs, owner, spender, amount }) => transferFrom(world, from, xvs, owner.val, spender.val, amount),
    ),

    new Command<{ xvs: XVSScenario; recipients: AddressV[]; amount: NumberV }>(
      `
        #### TransferScenario

        * "XVS TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "XVS TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("xvs", getXVS, { implicit: true }),
        new Arg("recipients", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { xvs, recipients, amount }) =>
        transferScenario(
          world,
          from,
          xvs,
          recipients.map(recipient => recipient.val),
          amount,
        ),
    ),

    new Command<{ xvs: XVSScenario; froms: AddressV[]; amount: NumberV }>(
      `
        #### TransferFromScenario

        * "XVS TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "XVS TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("xvs", getXVS, { implicit: true }),
        new Arg("froms", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { xvs, froms, amount }) =>
        transferFromScenario(
          world,
          from,
          xvs,
          froms.map(_from => _from.val),
          amount,
        ),
    ),

    new Command<{ xvs: XVS; account: AddressV }>(
      `
        #### Delegate

        * "XVS Delegate account:<Address>" - Delegates votes to a given account
          * E.g. "XVS Delegate Torrey"
      `,
      "Delegate",
      [new Arg("xvs", getXVS, { implicit: true }), new Arg("account", getAddressV)],
      (world, from, { xvs, account }) => delegate(world, from, xvs, account.val),
    ),
    new Command<{ xvs: XVS; blockNumber: NumberV }>(
      `
      #### SetBlockNumber

      * "SetBlockNumber <Seconds>" - Sets the blockTimestamp of the XVS Harness
      * E.g. "XVS SetBlockNumber 500"
      `,
      "SetBlockNumber",
      [new Arg("xvs", getXVS, { implicit: true }), new Arg("blockNumber", getNumberV)],
      (world, from, { xvs, blockNumber }) => setBlockNumber(world, from, xvs, blockNumber),
    ),
  ];
}

export async function processXVSEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("XVS", xvsCommands(), world, event, from);
}
