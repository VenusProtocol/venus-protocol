import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { XVSVaultImpl } from "../Contract/XVSVault";
import { getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { StringV } from "../Value";
import { World } from "../World";

const XVSVaultImplementation = getContract("XVSVault");

export interface XVSVaultImplData {
  invokation: Invokation<XVSVaultImpl>;
  name: string;
  contract: string;
  address?: string;
}

export async function buildXVSVaultImpl(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; xvsVaultImpl: XVSVaultImpl; xvsVaultData: XVSVaultImplData }> {
  const fetchers = [
    new Fetcher<{ name: StringV }, XVSVaultImplData>(
      `
      #### XVSVaultImpl
      * "XVSVaultImpl Deploy name:<String>" - Deploys XVS Vault implementation contract
      * E.g. "XVSVaultImpl Deploy MyVaultImpl"
      `,
      "XVSVaultImpl",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await XVSVaultImplementation.deploy<XVSVaultImpl>(world, from, []),
          name: name.val,
          contract: "XVSVault",
        };
      },
      { catchall: true },
    ),
  ];

  const xvsVaultData = await getFetcherValue<any, XVSVaultImplData>("DeployXVSVaultImpl", fetchers, world, params);
  const invokation = xvsVaultData.invokation!;
  delete xvsVaultData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const xvsVaultImpl = invokation.value!;
  xvsVaultData.address = xvsVaultImpl._address;

  world = await storeAndSaveContract(world, xvsVaultImpl, xvsVaultData.name, invokation, [
    { index: ["XVSVault", xvsVaultData.name], data: xvsVaultData },
  ]);

  return { world, xvsVaultImpl, xvsVaultData };
}
