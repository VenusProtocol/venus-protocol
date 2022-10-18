import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { SXP, SXPScenario } from "../Contract/SXP";
import { getAddressV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV } from "../Value";
import { World } from "../World";

const SXPContract = getContract("SXP");
const SXPScenarioContract = getContract("SXPScenario");

export interface TokenData {
  invokation: Invokation<SXP>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildSXP(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; sxp: SXP; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "SXP Deploy Scenario account:<Address>" - Deploys Scenario SXP Token
        * E.g. "SXP Deploy Scenario Geoff"
    `,
      "Scenario",
      [new Arg("account", getAddressV)],
      async (world, { account }) => {
        return {
          invokation: await SXPScenarioContract.deploy<SXPScenario>(world, from, [account.val]),
          contract: "SXPScenario",
          symbol: "SXP",
          name: "Venus Governance Token",
          decimals: 18,
        };
      },
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### SXP

      * "SXP Deploy account:<Address>" - Deploys SXP Token
        * E.g. "SXP Deploy Geoff"
    `,
      "SXP",
      [new Arg("account", getAddressV)],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await SXPScenarioContract.deploy<SXPScenario>(world, from, [account.val]),
            contract: "SXPScenario",
            symbol: "SXP",
            name: "Venus Governance Token",
            decimals: 18,
          };
        } else {
          return {
            invokation: await SXPContract.deploy<SXP>(world, from, [account.val]),
            contract: "SXP",
            symbol: "SXP",
            name: "Venus Governance Token",
            decimals: 18,
          };
        }
      },
      { catchall: true },
    ),
  ];

  const tokenData = await getFetcherValue<any, TokenData>("DeploySXP", fetchers, world, params);
  const invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const sxp = invokation.value!;
  tokenData.address = sxp._address;

  world = await storeAndSaveContract(world, sxp, "SXP", invokation, [
    { index: ["SXP"], data: tokenData },
    { index: ["Tokens", tokenData.symbol], data: tokenData },
  ]);

  tokenData.invokation = invokation;

  return { world, sxp, tokenData };
}
