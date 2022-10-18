import { Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { XVSVaultProxy } from "../Contract/XVSVault";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { World } from "../World";

const XVSVaultProxyContract = getContract("XVSVaultProxy");

export interface XVSVaultProxyData {
  invokation: Invokation<XVSVaultProxy>;
  name: string;
  contract: string;
  address?: string;
}

export async function buildXVSVaultProxy(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; xvsVaultProxy: XVSVaultProxy; xvsVaultData: XVSVaultProxyData }> {
  const fetchers = [
    new Fetcher<Record<string, any>, XVSVaultProxyData>(
      `
      #### XVSVaultProxy
      * "XVSVaultProxy Deploy" - Deploys XVS Vault proxy contract
      * E.g. "XVSVaultProxy Deploy"
      `,
      "XVSVaultProxy",
      [],
      async world => {
        return {
          invokation: await XVSVaultProxyContract.deploy<XVSVaultProxy>(world, from, []),
          name: "XVSVaultProxy",
          contract: "XVSVaultProxy",
        };
      },
      { catchall: true },
    ),
  ];

  const xvsVaultData = await getFetcherValue<any, XVSVaultProxyData>("DeployXVSVaultProxy", fetchers, world, params);
  const invokation = xvsVaultData.invokation!;
  delete xvsVaultData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const xvsVaultProxy = invokation.value!;
  xvsVaultData.address = xvsVaultProxy._address;

  world = await storeAndSaveContract(world, xvsVaultProxy, xvsVaultData.name, invokation, [
    { index: ["XVSVaultProxy", xvsVaultData.name], data: xvsVaultData },
  ]);

  return { world, xvsVaultProxy, xvsVaultData };
}
