import { buildVAIControllerImpl } from "../Builder/VAIControllerImplBuilder";
import { Arg, Command, processCommandEvent } from "../Command";
import { VAIController } from "../Contract/VAIController";
import { VToken } from "../Contract/VToken";
import { getVAIController } from "../ContractLookup";
import { getAddressV, getCoreValue, getEventV, getNumberV, getStringV } from "../CoreValue";
import { VAIControllerErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { encodeABI, rawValues } from "../Utils";
import { AddressV, EventV, NumberV, StringV } from "../Value";
// import {getLiquidity} from '../Value/VAIControllerValue';
import { getVTokenV } from "../Value/VTokenValue";
import { World, addAction, describeUser } from "../World";

async function genVAIController(world: World, from: string, params: Event): Promise<World> {
  const {
    world: nextWorld,
    vaicontrollerImpl: vaicontroller,
    vaicontrollerImplData: vaicontrollerData,
  } = await buildVAIControllerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added VAIController (${vaicontrollerData.description}) at address ${vaicontroller._address}`,
    vaicontrollerData.invokation,
  );

  return world;
}

async function sendAny(
  world: World,
  from: string,
  vaicontroller: VAIController,
  signature: string,
  callArgs: string[],
): Promise<World> {
  const fnData = encodeABI(world, signature, callArgs);
  await world.web3.eth.sendTransaction({
    to: vaicontroller._address,
    data: fnData,
    from: from,
  });
  return world;
}

async function setComptroller(
  world: World,
  from: string,
  vaicontroller: VAIController,
  comptroller: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaicontroller.methods._setComptroller(comptroller),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(world, `Set Comptroller to ${comptroller} as ${describeUser(world, from)}`, invokation);

  return world;
}

async function mint(world: World, from: string, vaicontroller: VAIController, amount: NumberV): Promise<World> {
  const invokation = await invoke(
    world,
    vaicontroller.methods.mintVAI(amount.encode()),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(world, `VAIController: ${describeUser(world, from)} borrows ${amount.show()}`, invokation);

  return world;
}

async function repay(world: World, from: string, vaicontroller: VAIController, amount: NumberV): Promise<World> {
  const showAmount = amount.show();
  const invokation = await invoke(
    world,
    vaicontroller.methods.repayVAI(amount.encode()),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(world, `VAIController: ${describeUser(world, from)} repays ${showAmount} of borrow`, invokation);

  return world;
}

async function liquidateVAI(
  world: World,
  from: string,
  vaicontroller: VAIController,
  borrower: string,
  collateral: VToken,
  repayAmount: NumberV,
): Promise<World> {
  const showAmount = repayAmount.show();
  const invokation = await invoke(
    world,
    vaicontroller.methods.liquidateVAI(borrower, repayAmount.encode(), collateral._address),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(
    world,
    `VAIController: ${describeUser(world, from)} liquidates ${showAmount} from of ${describeUser(
      world,
      borrower,
    )}, seizing ${collateral.name}.`,
    invokation,
  );

  return world;
}

async function setTreasuryData(
  world: World,
  from: string,
  vaicontroller: VAIController,
  guardian: string,
  address: string,
  percent: NumberV,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaicontroller.methods._setTreasuryData(guardian, address, percent.encode()),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(
    world,
    `Set treasury data to guardian: ${guardian}, address: ${address}, percent: ${percent.show()}`,
    invokation,
  );

  return world;
}

async function initialize(world: World, from: string, vaicontroller: VAIController): Promise<World> {
  const invokation = await invoke(world, vaicontroller.methods.initialize(), from, VAIControllerErrorReporter);

  world = addAction(world, `Initizlied the VAIController`, invokation);

  return world;
}

export function vaicontrollerCommands() {
  return [
    new Command<{ vaicontrollerParams: EventV }>(
      `
        #### Deploy

        * "VAIController Deploy ...vaicontrollerParams" - Generates a new VAIController (not as Impl)
          * E.g. "VAIController Deploy YesNo"
      `,
      "Deploy",
      [new Arg("vaicontrollerParams", getEventV, { variadic: true })],
      (world, from, { vaicontrollerParams }) => genVAIController(world, from, vaicontrollerParams.val),
    ),

    new Command<{ vaicontroller: VAIController; signature: StringV; callArgs: StringV[] }>(
      `
      #### Send
      * VAIController Send functionSignature:<String> callArgs[] - Sends any transaction to vaicontroller
      * E.g: VAIController Send "setVAIAddress(address)" (Address VAI)
      `,
      "Send",
      [
        new Arg("vaicontroller", getVAIController, { implicit: true }),
        new Arg("signature", getStringV),
        new Arg("callArgs", getCoreValue, { variadic: true, mapped: true }),
      ],
      (world, from, { vaicontroller, signature, callArgs }) =>
        sendAny(world, from, vaicontroller, signature.val, rawValues(callArgs)),
    ),

    new Command<{ vaicontroller: VAIController; comptroller: AddressV }>(
      `
        #### SetComptroller

        * "VAIController SetComptroller comptroller:<Address>" - Sets the comptroller address
          * E.g. "VAIController SetComptroller 0x..."
      `,
      "SetComptroller",
      [new Arg("vaicontroller", getVAIController, { implicit: true }), new Arg("comptroller", getAddressV)],
      (world, from, { vaicontroller, comptroller }) => setComptroller(world, from, vaicontroller, comptroller.val),
    ),

    new Command<{ vaicontroller: VAIController; amount: NumberV }>(
      `
        #### Mint

        * "VAIController Mint amount:<Number>" - Mint the given amount of VAI as specified user
          * E.g. "VAIController Mint 1.0e18"
      `,
      "Mint",
      [new Arg("vaicontroller", getVAIController, { implicit: true }), new Arg("amount", getNumberV)],
      // Note: we override from
      (world, from, { vaicontroller, amount }) => mint(world, from, vaicontroller, amount),
    ),

    new Command<{ vaicontroller: VAIController; amount: NumberV }>(
      `
        #### Repay

        * "VAIController Repay amount:<Number>" - Repays VAI in the given amount as specified user
          * E.g. "VAIController Repay 1.0e18"
      `,
      "Repay",
      [
        new Arg("vaicontroller", getVAIController, { implicit: true }),
        new Arg("amount", getNumberV, { nullable: true }),
      ],
      (world, from, { vaicontroller, amount }) => repay(world, from, vaicontroller, amount),
    ),

    new Command<{
      vaicontroller: VAIController;
      borrower: AddressV;
      vToken: VToken;
      collateral: VToken;
      repayAmount: NumberV;
    }>(
      `
        #### LiquidateVAI

        * "VAIController LiquidateVAI borrower:<User> vTokenCollateral:<Address> repayAmount:<Number>" - Liquidates repayAmount of VAI seizing collateral token
          * E.g. "VAIController LiquidateVAI Geoff vBAT 1.0e18"
      `,
      "LiquidateVAI",
      [
        new Arg("vaicontroller", getVAIController, { implicit: true }),
        new Arg("borrower", getAddressV),
        new Arg("collateral", getVTokenV),
        new Arg("repayAmount", getNumberV, { nullable: true }),
      ],
      (world, from, { vaicontroller, borrower, collateral, repayAmount }) =>
        liquidateVAI(world, from, vaicontroller, borrower.val, collateral, repayAmount),
    ),

    new Command<{ vaicontroller: VAIController; guardian: AddressV; address: AddressV; percent: NumberV }>(
      `
      #### SetTreasuryData
      * "VAIController SetTreasuryData <guardian> <address> <rate>" - Sets Treasury Data
      * E.g. "VAIController SetTreasuryData 0x.. 0x.. 1e18
      `,
      "SetTreasuryData",
      [
        new Arg("vaicontroller", getVAIController, { implicit: true }),
        new Arg("guardian", getAddressV),
        new Arg("address", getAddressV),
        new Arg("percent", getNumberV),
      ],
      (world, from, { vaicontroller, guardian, address, percent }) =>
        setTreasuryData(world, from, vaicontroller, guardian.val, address.val, percent),
    ),

    new Command<{ vaicontroller: VAIController }>(
      `
      #### Initialize
      * "VAIController Initialize" - Call Initialize
      * E.g. "VAIController Initialize
      `,
      "Initialize",
      [new Arg("vaicontroller", getVAIController, { implicit: true })],
      (world, from, { vaicontroller }) => initialize(world, from, vaicontroller),
    ),
  ];
}

export async function processVAIControllerEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("VAIController", vaicontrollerCommands(), world, event, from);
}
