import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { Maximillion } from "../Contract/Maximillion";
import { getAddressV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV } from "../Value";
import { World } from "../World";

const MaximillionContract = getContract("Maximillion");

export interface MaximillionData {
  invokation: Invokation<Maximillion>;
  description: string;
  vBnbAddress: string;
  address?: string;
}

export async function buildMaximillion(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; maximillion: Maximillion; maximillionData: MaximillionData }> {
  const fetchers = [
    new Fetcher<{ vBnb: AddressV }, MaximillionData>(
      `
        #### Maximillion

        * "" - Maximum Bnb Repays Contract
          * E.g. "Maximillion Deploy"
      `,
      "Maximillion",
      [new Arg("vBnb", getAddressV)],
      async (world, { vBnb }) => {
        return {
          invokation: await MaximillionContract.deploy<Maximillion>(world, from, [vBnb.val]),
          description: "Maximillion",
          vBnbAddress: vBnb.val,
        };
      },
      { catchall: true },
    ),
  ];

  const maximillionData = await getFetcherValue<any, MaximillionData>("DeployMaximillion", fetchers, world, event);
  const invokation = maximillionData.invokation;
  delete maximillionData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const maximillion = invokation.value!;
  maximillionData.address = maximillion._address;

  world = await storeAndSaveContract(world, maximillion, "Maximillion", invokation, [
    { index: ["Maximillion"], data: maximillionData },
  ]);

  return { world, maximillion, maximillionData };
}
