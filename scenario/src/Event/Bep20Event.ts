import {Event} from '../Event';
import {addAction, World} from '../World';
import {Bep20} from '../Contract/Bep20';
import {invoke} from '../Invokation';
import {buildBep20} from '../Builder/Bep20Builder';
import {
  getAddressV,
  getBoolV,
  getEventV,
  getNumberV,
  getStringV
} from '../CoreValue';
import {
  AddressV,
  BoolV,
  EventV,
  NumberV,
  StringV} from '../Value';
import {getBep20V} from '../Value/Bep20Value';
import {verify} from '../Verify';
import {Arg, Command, View, processCommandEvent} from '../Command';
import {VTokenErrorReporter} from '../ErrorReporter';
import {encodedNumber} from '../Encoding';
import {getBep20Data} from '../ContractLookup';

async function genToken(world: World, from: string, params: Event): Promise<World> {
  let {world: newWorld, erc20, tokenData} = await buildBep20(world, from, params);
  world = newWorld;

  world = addAction(
    world,
    `Added BEP-20 token ${tokenData.symbol} (${tokenData.description}) at address ${erc20._address}`,
    tokenData.invokation
  );

  return world;
}

async function verifyBep20(world: World, erc20: Bep20, name: string, contract: string, apiKey: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, erc20._address);
  }

  return world;
}

async function approve(world: World, from: string, erc20: Bep20, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, erc20.methods.approve(address, amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `Approved ${erc20.name} BEP-20 token for ${from} of ${amount.show()}`,
    invokation
  );

  return world;
}

async function faucet(world: World, from: string, erc20: Bep20, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, erc20.methods.allocateTo(address, amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `Fauceted ${amount.show()} BEP-20 tokens to ${address}`,
    invokation
  );

  return world;
}

async function transfer(world: World, from: string, erc20: Bep20, address: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, erc20.methods.transfer(address, amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} BEP-20 tokens from ${from} to ${address}`,
    invokation
  );

  return world;
}

async function transferFrom(world: World, from: string, erc20: Bep20, owner: string, spender: string, amount: NumberV): Promise<World> {
  let invokation = await invoke(world, erc20.methods.transferFrom(owner, spender, amount.encode()), from, VTokenErrorReporter);

  world = addAction(
    world,
    `"Transferred from" ${amount.show()} BEP-20 tokens from ${owner} to ${spender}`,
    invokation
  );

  return world;
}

async function setFail(world: World, from: string, erc20: Bep20, fail: boolean): Promise<World> {
  let invokation = await invoke(world, erc20.methods.setFail(fail), from, VTokenErrorReporter);

  world = addAction(
    world,
    `Set fail for ${erc20.name} to ${fail}`,
    invokation
  );

  return world;
}

async function setPaused(world: World, from: string, erc20: Bep20, pause: boolean): Promise<World> {
  let method = pause ? erc20.methods.pause() : erc20.methods.unpause();
  let invokation = await invoke(world, method, from);

  world = addAction(
    world,
    `Set ${erc20.name} ${pause ? 'paused' : 'unpaused'}`,
    invokation
  );

  return world;
}

async function setFee(world: World, from: string, erc20: Bep20, basisPointFee: NumberV, maxFee: NumberV): Promise<World> {
  let invokation = await invoke(world, erc20.methods.setParams(basisPointFee.encode(), maxFee.encode()), from);

  world = addAction(
    world,
    `Set fee on ${erc20.name} to ${basisPointFee} with a max of ${maxFee}`,
    invokation
  );

  return world;
}

export function erc20Commands() {
  return [
    new Command<{erc20Params: EventV}>(`
        #### Deploy

        * "Bep20 Deploy ...erc20Params" - Generates a new BEP-20 token by name
          * E.g. "Bep20 Deploy ZRX ..."
      `,
      "Deploy",
      [new Arg("erc20Params", getEventV, {variadic: true})],
      (world, from, {erc20Params}) => genToken(world, from, erc20Params.val)
    ),

    new View<{erc20Arg: StringV, apiKey: StringV}>(`
        #### Verify

        * "Bep20 <erc20> Verify apiKey:<String>" - Verifies Bep20 in BscScan
          * E.g. "Bep20 ZRX Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("erc20Arg", getStringV),
        new Arg("apiKey", getStringV)
      ],
      async (world, {erc20Arg, apiKey}) => {
        let [erc20, name, data] = await getBep20Data(world, erc20Arg.val);

        return await verifyBep20(world, erc20, name, data.get('contract')!, apiKey.val);
      },
      {namePos: 1}
    ),

    new Command<{erc20: Bep20, spender: AddressV, amount: NumberV}>(`
        #### Approve

        * "Bep20 <Bep20> Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "Bep20 ZRX Approve vZRX 1.0e18"
      `,
      "Approve",
      [
        new Arg("erc20", getBep20V),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, {erc20, spender, amount}) => {
        return approve(world, from, erc20, spender.val, amount)
      },
      {namePos: 1}
    ),

    new Command<{erc20: Bep20, recipient: AddressV, amount: NumberV}>(`
        #### Faucet

        * "Bep20 <Bep20> Faucet recipient:<User> <Amount>" - Adds an arbitrary balance to given user
          * E.g. "Bep20 ZRX Faucet Geoff 1.0e18"
      `,
      "Faucet",
      [
        new Arg("erc20", getBep20V),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, {erc20, recipient, amount}) => {
        return faucet(world, from, erc20, recipient.val, amount)
      },
      {namePos: 1}
    ),
    new Command<{erc20: Bep20, recipient: AddressV, amount: NumberV}>(`
        #### Transfer

        * "Bep20 <Bep20> Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "Bep20 ZRX Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [
        new Arg("erc20", getBep20V),
        new Arg("recipient", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, {erc20, recipient, amount}) => transfer(world, from, erc20, recipient.val, amount),
      {namePos: 1}
    ),
    new Command<{erc20: Bep20, owner: AddressV, spender: AddressV, amount: NumberV}>(`
        #### TransferFrom

        * "Bep20 <Bep20> TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "Bep20 ZRX TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("erc20", getBep20V),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
        new Arg("amount", getNumberV)
      ],
      (world, from, {erc20, owner, spender, amount}) => transferFrom(world, from, erc20, owner.val, spender.val, amount),
      {namePos: 1}
    ),
    new Command<{erc20: Bep20, fail: BoolV}>(`
        #### SetFail

        * "Bep20 <Bep20> SetFail fail:<Bool>" - Sets failure on or off for an EvilToken
          * E.g. "Bep20 EVL SetFail False"
      `,
      "SetFail",
      [
        new Arg("erc20", getBep20V),
        new Arg("fail", getBoolV)
      ],
      (world, from, {erc20, fail}) => setFail(world, from, erc20, fail.val),
      {namePos: 1}
    ),
    new Command<{erc20: Bep20, paused: BoolV}>(`
        #### Pause

        * "Bep20 <Bep20> Pause paused:<Bool>" - Sets paused on or off for WBTC
          * E.g. "Bep20 WBTC Pause"
          * E.g. "Bep20 WBTC Pause False"
      `,
      "Pause",
      [
        new Arg("erc20", getBep20V),
        new Arg("paused", getBoolV, {default: new BoolV(true)})
      ],
      (world, from, {erc20, paused}) => setPaused(world, from, erc20, paused.val),
      {namePos: 1}
    ),
    new Command<{erc20: Bep20, basisPointFee: NumberV, maxFee: NumberV}>(`
        #### SetFee

        * "Bep20 <Bep20> SetFee basisPointFee:<Number> maxFee:<Number>" - Sets the current fee and max fee on Tether. Current 
        * Current fee (basisPointFee) has a max of 20 basis points, while maxFee is capped at 50 Tether (a max absolute fee of 50 * 10 ^ decimals)
          * E.g. "Bep20 USDT SetFee 10 10"
      `,
      "SetFee",
      [
        new Arg("erc20", getBep20V),
        new Arg("basisPointFee", getNumberV),
        new Arg("maxFee", getNumberV)
      ],
      (world, from, {erc20, basisPointFee, maxFee}) => setFee(world, from, erc20, basisPointFee, maxFee),
      {namePos: 1}
    )
  ];
}

export async function processBep20Event(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("Bep20", erc20Commands(), world, event, from);
}
