import { Event } from '../Event';
import { World, addAction } from '../World';
import { VAI, VAIScenario } from '../Contract/VAI';
import { Invokation } from '../Invokation';
import { getAddressV } from '../CoreValue';
import { StringV, AddressV } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract } from '../Contract';

const VAIContract = getContract('VAI');
const VAIScenarioContract = getContract('VAIScenario');

export interface TokenData {
  invokation: Invokation<VAI>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildVAI(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; vai: VAI; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### Scenario

      * "VAI Deploy Scenario account:<Address>" - Deploys Scenario VAI Token
        * E.g. "VAI Deploy Scenario Geoff"
    `,
      'Scenario',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        return {
          invokation: await VAIScenarioContract.deploy<VAIScenario>(world, from, [account.val]),
          contract: 'VAIScenario',
          symbol: 'VAI',
          name: 'VAI Stablecoin',
          decimals: 18
        };
      }
    ),

    new Fetcher<{ account: AddressV }, TokenData>(
      `
      #### VAI

      * "VAI Deploy account:<Address>" - Deploys VAI Token
        * E.g. "VAI Deploy Geoff"
    `,
      'VAI',
      [
        new Arg("account", getAddressV),
      ],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await VAIScenarioContract.deploy<VAIScenario>(world, from, [account.val]),
            contract: 'VAIScenario',
            symbol: 'VAI',
            name: 'VAI Stablecoin',
            decimals: 18
          };
        } else {
          return {
            invokation: await VAIContract.deploy<VAI>(world, from, [account.val]),
            contract: 'VAI',
            symbol: 'VAI',
            name: 'VAI Stablecoin',
            decimals: 18
          };
        }
      },
      { catchall: true }
    )
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeployVAI", fetchers, world, params);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const vai = invokation.value!;
  tokenData.address = vai._address;

  world = await storeAndSaveContract(
    world,
    vai,
    'VAI',
    invokation,
    [
      { index: ['VAI'], data: tokenData },
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  tokenData.invokation = invokation;

  return { world, vai, tokenData };
}
