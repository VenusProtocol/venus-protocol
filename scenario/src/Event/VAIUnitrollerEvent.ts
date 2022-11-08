import { buildVAIUnitroller } from "../Builder/VAIUnitrollerBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { VAIControllerImpl } from "../Contract/VAIControllerImpl";
import { VAIUnitroller } from "../Contract/VAIUnitroller";
import { getVAIControllerImpl, getVAIUnitroller } from "../ContractLookup";
import { getAddressV, getEventV, getStringV } from "../CoreValue";
import { VAIControllerErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { AddressV, EventV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genVAIUnitroller(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, vaiunitroller, vaiunitrollerData } = await buildVAIUnitroller(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added VAIUnitroller (${vaiunitrollerData.description}) at address ${vaiunitroller._address}`,
    vaiunitrollerData.invokation,
  );

  return world;
}

async function verifyVAIUnitroller(world: World, vaiunitroller: VAIUnitroller, apiKey: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, "VAIUnitroller", "VAIUnitroller", vaiunitroller._address);
  }

  return world;
}

async function acceptAdmin(world: World, from: string, vaiunitroller: VAIUnitroller): Promise<World> {
  const invokation = await invoke(world, vaiunitroller.methods._acceptAdmin(), from, VAIControllerErrorReporter);

  world = addAction(world, `Accept admin as ${from}`, invokation);

  return world;
}

async function setPendingAdmin(
  world: World,
  from: string,
  vaiunitroller: VAIUnitroller,
  pendingAdmin: string,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaiunitroller.methods._setPendingAdmin(pendingAdmin),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(world, `Set pending admin to ${pendingAdmin}`, invokation);

  return world;
}

async function setPendingImpl(
  world: World,
  from: string,
  vaiunitroller: VAIUnitroller,
  vaicontrollerImpl: VAIControllerImpl,
): Promise<World> {
  const invokation = await invoke(
    world,
    vaiunitroller.methods._setPendingImplementation(vaicontrollerImpl._address),
    from,
    VAIControllerErrorReporter,
  );

  world = addAction(world, `Set pending vaicontroller impl to ${vaicontrollerImpl.name}`, invokation);

  return world;
}

export function vaiunitrollerCommands() {
  return [
    new Command<{ vaiunitrollerParams: EventV }>(
      `
        #### Deploy

        * "VAIUnitroller Deploy ...vaiunitrollerParams" - Generates a new VAIUnitroller
          * E.g. "VAIUnitroller Deploy"
      `,
      "Deploy",
      [new Arg("vaiunitrollerParams", getEventV, { variadic: true })],
      (world, from, { vaiunitrollerParams }) => genVAIUnitroller(world, from, vaiunitrollerParams.val),
    ),
    new View<{ vaiunitroller: VAIUnitroller; apiKey: StringV }>(
      `
        #### Verify

        * "VAIUnitroller Verify apiKey:<String>" - Verifies VAIUnitroller in BscScan
          * E.g. "VAIUnitroller Verify "myApiKey"
      `,
      "Verify",
      [new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }), new Arg("apiKey", getStringV)],
      (world, { vaiunitroller, apiKey }) => verifyVAIUnitroller(world, vaiunitroller, apiKey.val),
    ),
    new Command<{ vaiunitroller: VAIUnitroller; pendingAdmin: AddressV }>(
      `
        #### AcceptAdmin

        * "AcceptAdmin" - Accept admin for this vaiunitroller
          * E.g. "VAIUnitroller AcceptAdmin"
      `,
      "AcceptAdmin",
      [new Arg("vaiunitroller", getVAIUnitroller, { implicit: true })],
      (world, from, { vaiunitroller }) => acceptAdmin(world, from, vaiunitroller),
    ),
    new Command<{ vaiunitroller: VAIUnitroller; pendingAdmin: AddressV }>(
      `
        #### SetPendingAdmin

        * "SetPendingAdmin admin:<Admin>" - Sets the pending admin for this vaiunitroller
          * E.g. "VAIUnitroller SetPendingAdmin Jared"
      `,
      "SetPendingAdmin",
      [new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }), new Arg("pendingAdmin", getAddressV)],
      (world, from, { vaiunitroller, pendingAdmin }) => setPendingAdmin(world, from, vaiunitroller, pendingAdmin.val),
    ),
    new Command<{ vaiunitroller: VAIUnitroller; vaicontrollerImpl: VAIControllerImpl }>(
      `
        #### SetPendingImpl

        * "SetPendingImpl impl:<Impl>" - Sets the pending vaicontroller implementation for this vaiunitroller
          * E.g. "VAIUnitroller SetPendingImpl MyScenImpl" - Sets the current vaicontroller implementation to MyScenImpl
      `,
      "SetPendingImpl",
      [
        new Arg("vaiunitroller", getVAIUnitroller, { implicit: true }),
        new Arg("vaicontrollerImpl", getVAIControllerImpl),
      ],
      (world, from, { vaiunitroller, vaicontrollerImpl }) =>
        setPendingImpl(world, from, vaiunitroller, vaicontrollerImpl),
    ),
  ];
}

export async function processVAIUnitrollerEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("VAIUnitroller", vaiunitrollerCommands(), world, event, from);
}
