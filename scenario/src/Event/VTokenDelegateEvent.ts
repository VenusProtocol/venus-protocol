import { buildVTokenDelegate } from "../Builder/VTokenDelegateBuilder";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { VBep20Delegate } from "../Contract/VBep20Delegate";
import { getVTokenDelegateData } from "../ContractLookup";
import { getEventV, getStringV } from "../CoreValue";
import { Event } from "../Event";
import { EventV, StringV } from "../Value";
import { verify } from "../Verify";
import { World, addAction } from "../World";

async function genVTokenDelegate(world: World, from: string, event: Event): Promise<World> {
  const { world: nextWorld, vTokenDelegate, delegateData } = await buildVTokenDelegate(world, from, event);
  world = nextWorld;

  world = addAction(
    world,
    `Added vToken ${delegateData.name} (${delegateData.contract}) at address ${vTokenDelegate._address}`,
    delegateData.invokation,
  );

  return world;
}

async function verifyVTokenDelegate(
  world: World,
  vTokenDelegate: VBep20Delegate,
  name: string,
  contract: string,
  apiKey: string,
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, vTokenDelegate._address);
  }

  return world;
}

export function vTokenDelegateCommands() {
  return [
    new Command<{ vTokenDelegateParams: EventV }>(
      `
        #### Deploy

        * "VTokenDelegate Deploy ...vTokenDelegateParams" - Generates a new VTokenDelegate
          * E.g. "VTokenDelegate Deploy VDaiDelegate vDAIDelegate"
      `,
      "Deploy",
      [new Arg("vTokenDelegateParams", getEventV, { variadic: true })],
      (world, from, { vTokenDelegateParams }) => genVTokenDelegate(world, from, vTokenDelegateParams.val),
    ),
    new View<{ vTokenDelegateArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "VTokenDelegate <vTokenDelegate> Verify apiKey:<String>" - Verifies VTokenDelegate in BscScan
          * E.g. "VTokenDelegate vDaiDelegate Verify "myApiKey"
      `,
      "Verify",
      [new Arg("vTokenDelegateArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { vTokenDelegateArg, apiKey }) => {
        const [vToken, name, data] = await getVTokenDelegateData(world, vTokenDelegateArg.val);

        return await verifyVTokenDelegate(world, vToken, name, data.get("contract")!, apiKey.val);
      },
      { namePos: 1 },
    ),
  ];
}

export async function processVTokenDelegateEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("VTokenDelegate", vTokenDelegateCommands(), world, event, from);
}
