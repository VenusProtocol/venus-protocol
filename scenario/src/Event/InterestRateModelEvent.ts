import { buildInterestRateModel } from "../Builder/InterestRateModelBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { InterestRateModel } from "../Contract/InterestRateModel";
import { getInterestRateModelData } from "../ContractLookup";
import { getEventV, getStringV } from "../CoreValue";
import { Event } from "../Event";
import { EventV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genInterestRateModel(world: World, from: string, params: Event): Promise<World> {
  const {
    world: nextWorld,
    interestRateModel,
    interestRateModelData,
  } = await buildInterestRateModel(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed interest rate model (${interestRateModelData.description}) to address ${interestRateModel._address}`,
    interestRateModelData.invokation,
  );

  return world;
}

async function verifyInterestRateModel(
  world: World,
  interestRateModel: InterestRateModel,
  apiKey: string,
  modelName: string,
  contractName: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, interestRateModel._address);
  }

  return world;
}

export function interestRateModelCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new interest rate model
          * E.g. "InterestRateModel Deploy Fixed MyInterestRateModel 0.5"
          * E.g. "InterestRateModel Deploy Whitepaper MyInterestRateModel 0.05 0.45"
          * E.g. "InterestRateModel Deploy Standard MyInterestRateModel"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genInterestRateModel(world, from, params.val),
    ),
    new View<{ interestRateModelArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "<InterestRateModel> Verify apiKey:<String>" - Verifies InterestRateModel in BscScan
          * E.g. "InterestRateModel MyInterestRateModel Verify "myApiKey"
      `,
      "Verify",
      [new Arg("interestRateModelArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { interestRateModelArg, apiKey }) => {
        const [interestRateModel, name, data] = await getInterestRateModelData(world, interestRateModelArg.val);

        return await verifyInterestRateModel(world, interestRateModel, apiKey.val, name, data.get("contract")!);
      },
      { namePos: 1 },
    ),
  ];
}

export async function processInterestRateModelEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("InterestRateModel", interestRateModelCommands(), world, event, from);
}
