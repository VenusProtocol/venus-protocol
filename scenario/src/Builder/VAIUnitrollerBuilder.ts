import { Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { VAIUnitroller } from "../Contract/VAIUnitroller";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { World } from "../World";

const VAIUnitrollerContract = getContract("VAIUnitroller");

export interface VAIUnitrollerData {
  invokation: Invokation<VAIUnitroller>;
  description: string;
  address?: string;
}

export async function buildVAIUnitroller(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; vaiunitroller: VAIUnitroller; vaiunitrollerData: VAIUnitrollerData }> {
  const fetchers = [
    new Fetcher<Record<string, any>, VAIUnitrollerData>(
      `
        #### VAIUnitroller

        * "" - The Upgradable Comptroller
          * E.g. "VAIUnitroller Deploy"
      `,
      "VAIUnitroller",
      [],
      async world => {
        return {
          invokation: await VAIUnitrollerContract.deploy<VAIUnitroller>(world, from, []),
          description: "VAIUnitroller",
        };
      },
      { catchall: true },
    ),
  ];

  const vaiunitrollerData = await getFetcherValue<any, VAIUnitrollerData>(
    "DeployVAIUnitroller",
    fetchers,
    world,
    event,
  );
  const invokation = vaiunitrollerData.invokation;
  delete vaiunitrollerData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const vaiunitroller = invokation.value!;
  vaiunitrollerData.address = vaiunitroller._address;

  world = await storeAndSaveContract(world, vaiunitroller, "VAIUnitroller", invokation, [
    { index: ["VAIUnitroller"], data: vaiunitrollerData },
  ]);

  return { world, vaiunitroller, vaiunitrollerData };
}
