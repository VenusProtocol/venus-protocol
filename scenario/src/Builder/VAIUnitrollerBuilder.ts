import {Event} from '../Event';
import {addAction, World} from '../World';
import {VAIUnitroller} from '../Contract/VAIUnitroller';
import {Invokation} from '../Invokation';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract} from '../Contract';

const VAIUnitrollerContract = getContract("VAIUnitroller");

export interface VAIUnitrollerData {
  invokation: Invokation<VAIUnitroller>,
  description: string,
  address?: string
}

export async function buildVAIUnitroller(world: World, from: string, event: Event): Promise<{world: World, vaiunitroller: VAIUnitroller, vaiunitrollerData: VAIUnitrollerData}> {
  const fetchers = [
    new Fetcher<{}, VAIUnitrollerData>(`
        #### VAIUnitroller

        * "" - The Upgradable Comptroller
          * E.g. "VAIUnitroller Deploy"
      `,
      "VAIUnitroller",
      [],
      async (world, {}) => {
        return {
          invokation: await VAIUnitrollerContract.deploy<VAIUnitroller>(world, from, []),
          description: "VAIUnitroller"
        };
      },
      {catchall: true}
    )
  ];

  let vaiunitrollerData = await getFetcherValue<any, VAIUnitrollerData>("DeployVAIUnitroller", fetchers, world, event);
  let invokation = vaiunitrollerData.invokation;
  delete vaiunitrollerData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const vaiunitroller = invokation.value!;
  vaiunitrollerData.address = vaiunitroller._address;

  world = await storeAndSaveContract(
    world,
    vaiunitroller,
    'VAIUnitroller',
    invokation,
    [
      { index: ['VAIUnitroller'], data: vaiunitrollerData }
    ]
  );

  return {world, vaiunitroller, vaiunitrollerData};
}
