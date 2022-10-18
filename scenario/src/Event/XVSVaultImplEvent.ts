import { buildXVSVaultImpl } from "../Builder/XVSVaultImplBuilder";
import { Arg, Command, processCommandEvent } from "../Command";
import { XVSVault, XVSVaultImpl, XVSVaultProxy } from "../Contract/XVSVault";
import { getXVSVaultImpl, getXVSVaultProxy } from "../ContractLookup";
import { getEventV } from "../CoreValue";
import { NoErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { mergeContractABI } from "../Networks";
import { EventV } from "../Value";
import { World, addAction } from "../World";

async function genXVSVault(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, xvsVaultImpl, xvsVaultData } = await buildXVSVaultImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed XVS Vault implementation (${xvsVaultImpl.name}) to address ${xvsVaultImpl._address}`,
    xvsVaultData.invokation,
  );

  return world;
}

async function become(world: World, from: string, impl: XVSVaultImpl, proxy: XVSVaultProxy): Promise<World> {
  const invokation = await invoke(
    world,
    impl.methods._become(proxy._address),
    from,
    NoErrorReporter, // TODO: Change to vault reporter
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons

    // ^ I copied this comment from other parts of the code that merge ABIs but I have no idea
    // what exactly the "number of reasons" means here. So let me just hate people who write
    // these kinds of comments.

    world = await mergeContractABI(world, "XVSVault", proxy, proxy.name, impl.name);
  }

  world = addAction(world, `Become ${proxy._address}'s XVS Vault Implementation`, invokation);

  return world;
}

export function xvsVaultImplCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new XVS Vault implementation contract
        * E.g. "XVSVaultImpl Deploy MyVaultImpl"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genXVSVault(world, from, params.val),
    ),

    new Command<{ proxy: XVSVault; impl: XVSVaultImpl }>(
      `
        #### Become

        * "XVSVaultImpl <Impl> Become" - Become the new XVS Vault implementation
        * E.g. "XVSVaultImpl MyVoteImpl Become"
      `,
      "Become",
      [new Arg("proxy", getXVSVaultProxy, { implicit: true }), new Arg("impl", getXVSVaultImpl)],
      (world, from, { proxy, impl }) => become(world, from, impl, proxy),
      { namePos: 1 },
    ),
  ];
}

export async function processXVSVaultImplEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("XVSVaultImpl", xvsVaultImplCommands(), world, event, from);
}
