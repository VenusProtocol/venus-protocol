import { Event } from '../Event';
import { World, addAction } from '../World';
import { SXP, SXPScenario } from '../Contract/SXP';
import { Invokation } from '../Invokation';
import { getAddressV } from '../CoreValue';
import { StringV, AddressV } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract } from '../Contract';

const SXPContract = getContract('SXP');
const SXPScenarioContract = getContract('SXPScenario');

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
  params: Event
): Promise<{ world: World; sxp: SXP; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "SXP Deploy Scenario account:<Address>" - Deploys Scenario SXP Token
        * E.g. "SXP Deploy Scenario Geoff"
    `,
      'Scenario',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        return {
          invokation: await SXPScenarioContract.deploy<SXPScenario>(world, from, [account.val]),
          contract: 'SXPScenario',
          symbol: 'SXP',
          name: 'Venus Governance Token',
          decimals: 18
        };
      }
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### SXP

      * "SXP Deploy account:<Address>" - Deploys SXP Token
        * E.g. "SXP Deploy Geoff"
    `,
      'SXP',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await SXPScenarioContract.deploy<SXPScenario>(world, from, [account.val]),
            contract: 'SXPScenario',
            symbol: 'SXP',
            name: 'Venus Governance Token',
            decimals: 18
          };
        } else {
          return {
            invokation: await SXPContract.deploy<SXP>(world, from, [account.val]),
            contract: 'SXP',
            symbol: 'SXP',
            name: 'Venus Governance Token',
            decimals: 18
          };
        }
      },
      { catchall: true }
    )
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeploySXP", fetchers, world, params);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const sxp = invokation.value!;
  tokenData.address = sxp._address;

  world = await storeAndSaveContract(
    world,
    sxp,
    'SXP',
    invokation,
    [
      { index: ['SXP'], data: tokenData },
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  tokenData.invokation = invokation;

  return { world, sxp, tokenData };
}
