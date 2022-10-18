import { buildVAIControllerImpl } from "../Builder/VAIControllerImplBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { VAIControllerImpl } from "../Contract/VAIControllerImpl";
import { VAIUnitroller } from "../Contract/VAIUnitroller";
import { getVAIControllerImpl, getVAIControllerImplData, getVAIUnitroller } from "../ContractLookup";
import { getEventV, getStringV } from "../CoreValue";
import { VAIControllerErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { mergeContractABI } from "../Networks";
import { EventV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genVAIControllerImpl(world: World, from: string, params: Event): Promise<World> {
  const {
    world: nextWorld,
    vaicontrollerImpl,
    vaicontrollerImplData,
  } = await buildVAIControllerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added VAIController Implementation (${vaicontrollerImplData.description}) at address ${vaicontrollerImpl._address}`,
    vaicontrollerImplData.invokation,
  );

  return world;
}

async function mergeABI(
  world: World,
  from: string,
  vaicontrollerImpl: VAIControllerImpl,
  vaiunitroller: VAIUnitroller,
): Promise<World> {
  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "VAIController", vaiunitroller, vaiunitroller.name, vaicontrollerImpl.name);
  }

  return world;
}

async function becomeG1(
  world: World,
  from: string,
  vaicontrollerImpl: VAIControllerImpl,
  vaiunitroller: VAIUnitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaicontrollerImpl.methods._become(vaiunitroller._address),
    from,
    VAIControllerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "VAIController", vaiunitroller, vaiunitroller.name, vaicontrollerImpl.name);
  }

  world = addAction(world, `Become ${vaiunitroller._address}'s VAIController Impl`, invokation);

  return world;
}

async function becomeG2(
  world: World,
  from: string,
  vaicontrollerImpl: VAIControllerImpl,
  vaiunitroller: VAIUnitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaicontrollerImpl.methods._become(vaiunitroller._address),
    from,
    VAIControllerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "VAIController", vaiunitroller, vaiunitroller.name, vaicontrollerImpl.name);
  }

  world = addAction(world, `Become ${vaiunitroller._address}'s VAIController Impl`, invokation);

  return world;
}

async function become(
  world: World,
  from: string,
  vaicontrollerImpl: VAIControllerImpl,
  vaiunitroller: VAIUnitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaicontrollerImpl.methods._become(vaiunitroller._address),
    from,
    VAIControllerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "VAIController", vaiunitroller, vaiunitroller.name, vaicontrollerImpl.name);
  }

  world = addAction(world, `Become ${vaiunitroller._address}'s VAIController Impl`, invokation);

  return world;
}

async function verifyVAIControllerImpl(
  world: World,
  vaicontrollerImpl: VAIControllerImpl,
  name: string,
  contract: string,
  apiKey: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, vaicontrollerImpl._address);
  }

  return world;
}

export function vaicontrollerImplCommands() {
  return [
    new Command<{ vaicontrollerImplParams: EventV }>(
      `
        #### Deploy

        * "VAIControllerImpl Deploy ...vaicontrollerImplParams" - Generates a new VAIController Implementation
          * E.g. "VAIControllerImpl Deploy MyScen Scenario"
      `,
      "Deploy",
      [new Arg("vaicontrollerImplParams", getEventV, { variadic: true })],
      (world, from, { vaicontrollerImplParams }) => genVAIControllerImpl(world, from, vaicontrollerImplParams.val),
    ),
    new View<{ vaicontrollerImplArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "VAIControllerImpl <Impl> Verify apiKey:<String>" - Verifies VAIController Implemetation in BscScan
          * E.g. "VAIControllerImpl Verify "myApiKey"
      `,
      "Verify",
      [new Arg("vaicontrollerImplArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { vaicontrollerImplArg, apiKey }) => {
        const [vaicontrollerImpl, name, data] = await getVAIControllerImplData(world, vaicontrollerImplArg.val);

        return await verifyVAIControllerImpl(world, vaicontrollerImpl, name, data.get("contract")!, apiKey.val);
      },
      { namePos: 1 },
    ),

    new Command<{
      vaiunitroller: VAIUnitroller;
      vaicontrollerImpl: VAIControllerImpl;
    }>(
      `
        #### BecomeG1
        * "VAIControllerImpl <Impl> BecomeG1" - Become the vaicontroller, if possible.
          * E.g. "VAIControllerImpl MyImpl BecomeG1
      `,
      "BecomeG1",
      [
        new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }),
        new Arg("vaicontrollerImpl", getVAIControllerImpl),
      ],
      (world, from, { vaiunitroller, vaicontrollerImpl }) => {
        return becomeG1(world, from, vaicontrollerImpl, vaiunitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      vaiunitroller: VAIUnitroller;
      vaicontrollerImpl: VAIControllerImpl;
    }>(
      `
        #### BecomeG2
        * "VAIControllerImpl <Impl> BecomeG2" - Become the vaicontroller, if possible.
          * E.g. "VAIControllerImpl MyImpl BecomeG2
      `,
      "BecomeG2",
      [
        new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }),
        new Arg("vaicontrollerImpl", getVAIControllerImpl),
      ],
      (world, from, { vaiunitroller, vaicontrollerImpl }) => {
        return becomeG2(world, from, vaicontrollerImpl, vaiunitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      vaiunitroller: VAIUnitroller;
      vaicontrollerImpl: VAIControllerImpl;
    }>(
      `
        #### Become

        * "VAIControllerImpl <Impl> Become" - Become the vaicontroller, if possible.
          * E.g. "VAIControllerImpl MyImpl Become
      `,
      "Become",
      [
        new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }),
        new Arg("vaicontrollerImpl", getVAIControllerImpl),
      ],
      (world, from, { vaiunitroller, vaicontrollerImpl }) => {
        return become(world, from, vaicontrollerImpl, vaiunitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      vaiunitroller: VAIUnitroller;
      vaicontrollerImpl: VAIControllerImpl;
    }>(
      `
        #### MergeABI

        * "VAIControllerImpl <Impl> MergeABI" - Merges the ABI, as if it was a become.
          * E.g. "VAIControllerImpl MyImpl MergeABI
      `,
      "MergeABI",
      [
        new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }),
        new Arg("vaicontrollerImpl", getVAIControllerImpl),
      ],
      (world, from, { vaiunitroller, vaicontrollerImpl }) => mergeABI(world, from, vaicontrollerImpl, vaiunitroller),
      { namePos: 1 },
    ),
  ];
}

export async function processVAIControllerImplEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("VAIControllerImpl", vaicontrollerImplCommands(), world, event, from);
}
