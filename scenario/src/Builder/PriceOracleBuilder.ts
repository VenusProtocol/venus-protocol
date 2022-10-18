import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract, getTestContract } from "../Contract";
import { PriceOracle } from "../Contract/PriceOracle";
import { getAddressV, getExpNumberV, getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV, NumberV, StringV } from "../Value";
import { World } from "../World";

const FixedPriceOracle = getTestContract("FixedPriceOracle");
const SimplePriceOracle = getContract("SimplePriceOracle");
const AnchorPriceOracle = getContract("AnchorPriceOracle");
const NotPriceOracle = getTestContract("NotPriceOracle");
const PriceOracleInterface = getTestContract("PriceOracle");

export interface PriceOracleData {
  invokation?: Invokation<PriceOracle>;
  contract?: PriceOracle;
  description: string;
  address?: string;
}

export async function buildPriceOracle(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; priceOracle: PriceOracle; priceOracleData: PriceOracleData }> {
  const fetchers = [
    new Fetcher<{ price: NumberV }, PriceOracleData>(
      `
        #### Fixed

        * "Fixed price:<Exp>" - Fixed price
          * E.g. "PriceOracle Deploy (Fixed 20.0)"
      `,
      "Fixed",
      [new Arg("price", getExpNumberV)],
      async (world, { price }) => {
        return {
          invokation: await FixedPriceOracle.deploy<PriceOracle>(world, from, [price.val]),
          description: "Fixed Price Oracle",
        };
      },
    ),
    new Fetcher<Record<string, any>, PriceOracleData>(
      `
        #### Simple

        * "Simple" - The a simple price oracle that has a harness price setter
          * E.g. "PriceOracle Deploy Simple"
      `,
      "Simple",
      [],
      async world => {
        return {
          invokation: await SimplePriceOracle.deploy<PriceOracle>(world, from, []),
          description: "Simple Price Oracle",
        };
      },
    ),
    new Fetcher<{ poster: AddressV }, PriceOracleData>(
      `
        #### Anchor

        * "Anchor <poster:Address>" - The anchor price oracle that caps price movements to anchors
          * E.g. "PriceOracle Deploy Anchor 0x..."
      `,
      "Anchor",
      [new Arg("poster", getAddressV)],
      async (world, { poster }) => {
        return {
          invokation: await AnchorPriceOracle.deploy<PriceOracle>(world, from, [poster.val]),
          description: "Anchor Price Oracle",
          poster: poster.val,
        };
      },
    ),
    new Fetcher<Record<string, any>, PriceOracleData>(
      `
        #### NotPriceOracle

        * "NotPriceOracle" - Not actually a price oracle
          * E.g. "PriceOracle Deploy NotPriceOracle"
      `,
      "NotPriceOracle",
      [],
      async world => {
        return {
          invokation: await NotPriceOracle.deploy<PriceOracle>(world, from, []),
          description: "Not a Price Oracle",
        };
      },
    ),
  ];

  const priceOracleData = await getFetcherValue<any, PriceOracleData>("DeployPriceOracle", fetchers, world, event);
  const invokation = priceOracleData.invokation!;
  delete priceOracleData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const priceOracle = invokation.value!;
  priceOracleData.address = priceOracle._address;

  world = await storeAndSaveContract(world, priceOracle, "PriceOracle", invokation, [
    { index: ["PriceOracle"], data: priceOracleData },
  ]);

  return { world, priceOracle, priceOracleData };
}

export async function setPriceOracle(
  world: World,
  event: Event,
): Promise<{ world: World; priceOracle: PriceOracle; priceOracleData: PriceOracleData }> {
  const fetchers = [
    new Fetcher<{ address: AddressV; description: StringV }, PriceOracleData>(
      `
        #### Standard

        * "Standard" - The standard price oracle
          * E.g. "PriceOracle Set Standard \"0x...\" \"Standard Price Oracle\""
      `,
      "Standard",
      [new Arg("address", getAddressV), new Arg("description", getStringV)],
      async (world, { address, description }) => {
        return {
          contract: await PriceOracleInterface.at<PriceOracle>(world, address.val),
          description: description.val,
        };
      },
    ),
  ];

  const priceOracleData = await getFetcherValue<any, PriceOracleData>("SetPriceOracle", fetchers, world, event);
  const priceOracle = priceOracleData.contract!;
  delete priceOracleData.contract;

  priceOracleData.address = priceOracle._address;

  world = await storeAndSaveContract(world, priceOracle, "PriceOracle", null, [
    { index: ["PriceOracle"], data: priceOracleData },
  ]);

  return { world, priceOracle, priceOracleData };
}
