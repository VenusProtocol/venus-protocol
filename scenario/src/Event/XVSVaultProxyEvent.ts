import { buildXVSVaultProxy } from "../Builder/XVSVaultProxyBuilder";
import { Arg, Command, processCommandEvent } from "../Command";
import { XVSVaultProxy } from "../Contract/XVSVault";
import { getXVSVaultProxy } from "../ContractLookup";
import { getAddressV, getEventV } from "../CoreValue";
import { NoErrorReporter } from "../ErrorReporter";
import { Event } from "../Event";
import { invoke } from "../Invokation";
import { AddressV, EventV } from "../Value";
import { World, addAction } from "../World";

async function genXVSVaultProxy(world: World, from: string, params: Event): Promise<World> {
  const { world: nextWorld, xvsVaultProxy, xvsVaultData } = await buildXVSVaultProxy(world, from, params);
  world = nextWorld;

  world = addAction(world, `Deployed XVS Vault Proxy to address ${xvsVaultProxy._address}`, xvsVaultData.invokation);

  return world;
}

async function setPendingImplementation(
  world: World,
  from: string,
  xvsVault: XVSVaultProxy,
  impl: string,
): Promise<World> {
  const invokation = await invoke(world, xvsVault.methods._setPendingImplementation(impl), from, NoErrorReporter);

  world = addAction(world, `Set pending implementation of ${xvsVault.name} to ${impl}`, invokation);

  return world;
}

export function xvsVaultProxyCommands() {
  return [
    new Command<{ params: EventV }>(
      `
        #### Deploy

        * "Deploy ...params" - Generates a new XVS Vault (non-proxy version)
        * E.g. "XVSVaultProxy Deploy"
      `,
      "Deploy",
      [new Arg("params", getEventV, { variadic: true })],
      (world, from, { params }) => genXVSVaultProxy(world, from, params.val),
    ),

    new Command<{ xvsVaultProxy: XVSVaultProxy; newImpl: AddressV }>(
      `
        #### SetPendingImplementation

        * "XVSVault SetPendingImplementation newImpl:<Address>" - Sets the new pending implementation
        * E.g. "XVSVault SetPendingImplementation (Address XVSVaultImplementation)"
      `,
      "SetPendingImplementation",
      [new Arg("xvsVaultProxy", getXVSVaultProxy, { implicit: true }), new Arg("newImpl", getAddressV)],
      (world, from, { xvsVaultProxy, newImpl }) => setPendingImplementation(world, from, xvsVaultProxy, newImpl.val),
    ),
  ];
}

export async function processXVSVaultProxyEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("XVSVaultProxy", xvsVaultProxyCommands(), world, event, from);
}
