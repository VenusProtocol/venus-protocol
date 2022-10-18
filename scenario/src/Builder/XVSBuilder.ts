import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { XVS, XVSScenario } from "../Contract/XVS";
import { getAddressV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV } from "../Value";
import { World } from "../World";

const XVSContract = getContract("XVS");
const XVSScenarioContract = getContract("XVSScenario");

export interface TokenData {
  invokation: Invokation<XVS>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildXVS(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; xvs: XVS; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "XVS Deploy Scenario account:<Address>" - Deploys Scenario XVS Token
        * E.g. "XVS Deploy Scenario Geoff"
    `,
      "Scenario",
      [new Arg("account", getAddressV)],
      async (world, { account }) => {
        return {
          invokation: await XVSScenarioContract.deploy<XVSScenario>(world, from, [account.val]),
          contract: "XVSScenario",
          symbol: "XVS",
          name: "Venus Governance Token",
          decimals: 18,
        };
      },
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### XVS

      * "XVS Deploy account:<Address>" - Deploys XVS Token
        * E.g. "XVS Deploy Geoff"
    `,
      "XVS",
      [new Arg("account", getAddressV)],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await XVSScenarioContract.deploy<XVSScenario>(world, from, [account.val]),
            contract: "XVSScenario",
            symbol: "XVS",
            name: "Venus Governance Token",
            decimals: 18,
          };
        } else {
          return {
            invokation: await XVSContract.deploy<XVS>(world, from, [account.val]),
            contract: "XVS",
            symbol: "XVS",
            name: "Venus Governance Token",
            decimals: 18,
          };
        }
      },
      { catchall: true },
    ),
  ];

  const tokenData = await getFetcherValue<any, TokenData>("DeployXVS", fetchers, world, params);
  const invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const xvs = invokation.value!;
  tokenData.address = xvs._address;

  world = await storeAndSaveContract(world, xvs, "XVS", invokation, [
    { index: ["XVS"], data: tokenData },
    { index: ["Tokens", tokenData.symbol], data: tokenData },
  ]);

  tokenData.invokation = invokation;

  return { world, xvs, tokenData };
}
