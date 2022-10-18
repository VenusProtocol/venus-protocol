import { Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { Unitroller } from "../Contract/Unitroller";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { World } from "../World";

const UnitrollerContract = getContract("Unitroller");

export interface UnitrollerData {
  invokation: Invokation<Unitroller>;
  description: string;
  address?: string;
}

export async function buildUnitroller(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; unitroller: Unitroller; unitrollerData: UnitrollerData }> {
  const fetchers = [
    new Fetcher<Record<string, any>, UnitrollerData>(
      `
        #### Unitroller

        * "" - The Upgradable Comptroller
          * E.g. "Unitroller Deploy"
      `,
      "Unitroller",
      [],
      async world => {
        return {
          invokation: await UnitrollerContract.deploy<Unitroller>(world, from, []),
          description: "Unitroller",
        };
      },
      { catchall: true },
    ),
  ];

  const unitrollerData = await getFetcherValue<any, UnitrollerData>("DeployUnitroller", fetchers, world, event);
  const invokation = unitrollerData.invokation;
  delete unitrollerData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const unitroller = invokation.value!;
  unitrollerData.address = unitroller._address;

  world = await storeAndSaveContract(world, unitroller, "Unitroller", invokation, [
    { index: ["Unitroller"], data: unitrollerData },
  ]);

  return { world, unitroller, unitrollerData };
}
