import { buildVAI } from "../Builder/VAIBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { VAI, VAIScenario } from "../Contract/VAI";
import { getVAI } from "../ContractLookup";
import { getAddressV, getEventV, getNumberV, getStringV } from "../CoreValue";
import { NoErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { AddressV, EventV, NumberV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genVAI(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, vai, tokenData } = await buildVAI(world, from, params);
  world = nextWorld;

  world = addAction(world, `Deployed VAI (${vai.name}) to address ${vai._address}`, tokenData.invokation);

  return world;
}

async function verifyVAI(
  world: World,
  vai: VAI,
  apiKey: string,
  modelName: string,
  contractName: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, vai._address);
  }

  return world;
}

async function approve(world: World, from: string, vai: VAI, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vai.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Approved VAI token for ${from} of ${amount.show()}`, invokation);

  return world;
}

async function faucet(world: World, from: string, vai: VAI, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vai.methods.allocateTo(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Fauceted ${amount.show()} VAI tokens to ${address}`, invokation);

  return world;
}

async function transfer(world: World, from: string, vai: VAI, address: string, amount: NumberV): Promise<World> {
  const invokation = await invoke(world, vai.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(world, `Transferred ${amount.show()} VAI tokens from ${from} to ${address}`, invokation);

  return world;
}

async function transferFrom(
  world: World,
  from: string,
  vai: VAI,
  owner: string,
  spender: string,
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    vai.methods.transferFrom(owner, spender, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `"Transferred from" ${amount.show()} VAI tokens from ${owner} to ${spender}`, invokation);

  return world;
}

async function transferScenario(
  world: World,
  from: string,
  vai: VAIScenario,
  addresses: string[],
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    vai.methods.transferScenario(addresses, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Transferred ${amount.show()} VAI tokens from ${from} to ${addresses}`, invokation);

  return world;
}

async function transferFromScenario(
  world: World,
  from: string,
  vai: VAIScenario,
  addresses: string[],
  amount: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    vai.methods.transferFromScenario(addresses, amount.encode()),
    from,
    NoErrorReporter,
  );

  world = addAction(world, `Transferred ${amount.show()} VAI tokens from ${addresses} to ${from}`, invokation);

  return world;
}

async function rely(world: World, from: string, vai: VAI, address: string): Promise<World> {
  const invokation = await invoke(world, vai.methods.rely(address), from, NoErrorReporter);

  world = addAction(world, `Add rely to VAI token to ${address}`, invokation);

  return world;
}

export function vaiCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new VAI token
          * E.g. "VAI Deploy"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genVAI(world, from, params.val),
    ),

    new View<{ vai: VAI; apiKey: StringV; contractName: StringV }>(
      `
        #### Verify

        * "<VAI> Verify apiKey:<String> contractName:<String>=VAI" - Verifies VAI token in BscScan
          * E.g. "VAI Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("vai", getVAI, { implicit: true }),
        new Arg("apiKey", getStringV),
        new Arg("contractName", getStringV, { default: new StringV("VAI") }),
      ],
      async (world, { vai, apiKey, contractName }) => {
        return await verifyVAI(world, vai, apiKey.val, vai.name, contractName.val);
      },
    ),

    new Command<{ vai: VAI; spender: AddressV; amount: NumberV }>(
      `
        #### Approve

        * "VAI Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "VAI Approve Geoff 1.0e18"
      `,
      "Approve",
      [new Arg("vai", getVAI, { implicit: true }), new Arg("spender", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { vai, spender, amount }) => {
        return approve(world, from, vai, spender.val, amount);
      },
    ),

    new Command<{ vai: VAI; recipient: AddressV; amount: NumberV }>(
      `
        #### Faucet

        * "VAI Faucet recipient:<User> <Amount>" - Adds an arbitrary balance to given user
          * E.g. "VAI Faucet Geoff 1.0e18"
      `,
      "Faucet",
      [new Arg("vai", getVAI, { implicit: true }), new Arg("recipient", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { vai, recipient, amount }) => {
        return faucet(world, from, vai, recipient.val, amount);
      },
    ),

    new Command<{ vai: VAI; recipient: AddressV; amount: NumberV }>(
      `
        #### Transfer

        * "VAI Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "VAI Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [new Arg("vai", getVAI, { implicit: true }), new Arg("recipient", getAddressV), new Arg("amount", getNumberV)],
      (world, from, { vai, recipient, amount }) => transfer(world, from, vai, recipient.val, amount),
    ),

    new Command<{ vai: VAI; owner: AddressV; spender: AddressV; amount: NumberV }>(
      `
        #### TransferFrom

        * "VAI TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "VAI TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("vai", getVAI, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV),
      ],
      (world, from, { vai, owner, spender, amount }) => transferFrom(world, from, vai, owner.val, spender.val, amount),
    ),

    new Command<{ vai: VAIScenario; recipients: AddressV[]; amount: NumberV }>(
      `
        #### TransferScenario

        * "VAI TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "VAI TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("vai", getVAI, { implicit: true }),
        new Arg("recipients", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { vai, recipients, amount }) =>
        transferScenario(
          world,
          from,
          vai,
          recipients.map(recipient => recipient.val),
          amount,
        ),
    ),

    new Command<{ vai: VAIScenario; froms: AddressV[]; amount: NumberV }>(
      `
        #### TransferFromScenario

        * "VAI TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "VAI TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("vai", getVAI, { implicit: true }),
        new Arg("froms", getAddressV, { mapped: true }),
        new Arg("amount", getNumberV),
      ],
      (world, from, { vai, froms, amount }) =>
        transferFromScenario(
          world,
          from,
          vai,
          froms.map(_from => _from.val),
          amount,
        ),
    ),

    new Command<{ vai: VAI; address: AddressV; amount: NumberV }>(
      `
        #### Rely

        * "VAI Rely rely:<Address>" - Adds rely address
          * E.g. "VAI Rely 0xXX..."
      `,
      "Rely",
      [new Arg("vai", getVAI, { implicit: true }), new Arg("address", getAddressV)],
      (world, from, { vai, address }) => {
        return rely(world, from, vai, address.val);
      },
    ),
  ];
}

export async function processVAIEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("VAI", vaiCommands(), world, event, from);
}
