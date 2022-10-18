import { buildComptrollerImpl } from "../Builder/ComptrollerImplBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { ComptrollerImpl } from "../Contract/ComptrollerImpl";
import { Unitroller } from "../Contract/Unitroller";
import { getComptrollerImpl, getComptrollerImplData, getUnitroller } from "../ContractLookup";
import { getEventV, getStringV } from "../CoreValue";
import { ComptrollerErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { mergeContractABI } from "../Networks";
import { EventV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genComptrollerImpl(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, comptrollerImpl, comptrollerImplData } = await buildComptrollerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added Comptroller Implementation (${comptrollerImplData.description}) at address ${comptrollerImpl._address}`,
    comptrollerImplData.invokation,
  );

  return world;
}

async function mergeABI(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  return world;
}

async function becomeG1(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptrollerImpl.methods._become(unitroller._address),
    from,
    ComptrollerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  world = addAction(world, `Become ${unitroller._address}'s Comptroller Impl`, invokation);

  return world;
}

async function becomeG2(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptrollerImpl.methods._become(unitroller._address),
    from,
    ComptrollerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  world = addAction(world, `Become ${unitroller._address}'s Comptroller Impl`, invokation);

  return world;
}

async function becomeG3(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptrollerImpl.methods._become(unitroller._address),
    from,
    ComptrollerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  world = addAction(world, `Become ${unitroller._address}'s Comptroller Impl`, invokation);

  return world;
}

async function becomeG4(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptrollerImpl.methods._become(unitroller._address),
    from,
    ComptrollerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  world = addAction(world, `Become ${unitroller._address}'s Comptroller Impl`, invokation);

  return world;
}

async function becomeG5(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptrollerImpl.methods._become(unitroller._address),
    from,
    ComptrollerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  world = addAction(world, `Become ${unitroller._address}'s Comptroller Impl`, invokation);

  return world;
}

async function become(
  world: World,
  from: string,
  comptrollerImpl: ComptrollerImpl,
  unitroller: Unitroller,
): Promise<World> {
  const invokation = await invoke(
    world,
    comptrollerImpl.methods._become(unitroller._address),
    from,
    ComptrollerErrorReporter,
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, "Comptroller", unitroller, unitroller.name, comptrollerImpl.name);
  }

  world = addAction(world, `Become ${unitroller._address}'s Comptroller Impl`, invokation);

  return world;
}

async function verifyComptrollerImpl(
  world: World,
  comptrollerImpl: ComptrollerImpl,
  name: string,
  contract: string,
  apiKey: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, comptrollerImpl._address);
  }

  return world;
}

export function comptrollerImplCommands() {
  return [
    new Command<{ comptrollerImplParams: EventV }>(
      `
        #### Deploy

        * "ComptrollerImpl Deploy ...comptrollerImplParams" - Generates a new Comptroller Implementation
          * E.g. "ComptrollerImpl Deploy MyScen Scenario"
      `,
      "Deploy",
      [new Arg("comptrollerImplParams", getEventV, { variadic: true })],
      (world, from, { comptrollerImplParams }) => genComptrollerImpl(world, from, comptrollerImplParams.val),
    ),
    new View<{ comptrollerImplArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "ComptrollerImpl <Impl> Verify apiKey:<String>" - Verifies Comptroller Implemetation in BscScan
          * E.g. "ComptrollerImpl Verify "myApiKey"
      `,
      "Verify",
      [new Arg("comptrollerImplArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { comptrollerImplArg, apiKey }) => {
        const [comptrollerImpl, name, data] = await getComptrollerImplData(world, comptrollerImplArg.val);

        return await verifyComptrollerImpl(world, comptrollerImpl, name, data.get("contract")!, apiKey.val);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### BecomeG1
        * "ComptrollerImpl <Impl> BecomeG1" - Become the comptroller, if possible.
          * E.g. "ComptrollerImpl MyImpl BecomeG1
      `,
      "BecomeG1",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => {
        return becomeG1(world, from, comptrollerImpl, unitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### BecomeG2
        * "ComptrollerImpl <Impl> BecomeG2" - Become the comptroller, if possible.
          * E.g. "ComptrollerImpl MyImpl BecomeG2
      `,
      "BecomeG2",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => {
        return becomeG2(world, from, comptrollerImpl, unitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### BecomeG3
        * "ComptrollerImpl <Impl> BecomeG3" - Become the comptroller, if possible.
          * E.g. "ComptrollerImpl MyImpl BecomeG3
      `,
      "BecomeG3",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => {
        return becomeG3(world, from, comptrollerImpl, unitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### BecomeG4
        * "ComptrollerImpl <Impl> BecomeG4" - Become the comptroller, if possible.
          * E.g. "ComptrollerImpl MyImpl BecomeG4
      `,
      "BecomeG4",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => {
        return becomeG4(world, from, comptrollerImpl, unitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### BecomeG5
        * "ComptrollerImpl <Impl> BecomeG5" - Become the comptroller, if possible.
          * E.g. "ComptrollerImpl MyImpl BecomeG5
      `,
      "BecomeG5",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => {
        return becomeG5(world, from, comptrollerImpl, unitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### Become

        * "ComptrollerImpl <Impl> Become" - Become the comptroller, if possible.
          * E.g. "ComptrollerImpl MyImpl Become
      `,
      "Become",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => {
        return become(world, from, comptrollerImpl, unitroller);
      },
      { namePos: 1 },
    ),

    new Command<{
      unitroller: Unitroller;
      comptrollerImpl: ComptrollerImpl;
    }>(
      `
        #### MergeABI

        * "ComptrollerImpl <Impl> MergeABI" - Merges the ABI, as if it was a become.
          * E.g. "ComptrollerImpl MyImpl MergeABI
      `,
      "MergeABI",
      [new Arg("unitroller", getUnitroller, { implicit: true }), new Arg("comptrollerImpl", getComptrollerImpl)],
      (world, from, { unitroller, comptrollerImpl }) => mergeABI(world, from, comptrollerImpl, unitroller),
      { namePos: 1 },
    ),
  ];
}

export async function processComptrollerImplEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("ComptrollerImpl", comptrollerImplCommands(), world, event, from);
}
