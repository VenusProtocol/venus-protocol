import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { PriceOracleProxy } from "../Contract/PriceOracleProxy";
import { getAddressV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV } from "../Value";
import { World } from "../World";

const PriceOracleProxyContract = getContract("PriceOracleProxy");

export interface PriceOracleProxyData {
  invokation?: Invokation<PriceOracleProxy>;
  contract?: PriceOracleProxy;
  description: string;
  address?: string;
  vBNB: string;
  vUSDC: string;
  vDAI: string;
}

export async function buildPriceOracleProxy(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; priceOracleProxy: PriceOracleProxy; invokation: Invokation<PriceOracleProxy> }> {
  const fetchers = [
    new Fetcher<
      {
        guardian: AddressV;
        priceOracle: AddressV;
        vBNB: AddressV;
        vUSDC: AddressV;
        vSAI: AddressV;
        vDAI: AddressV;
        vUSDT: AddressV;
      },
      PriceOracleProxyData
    >(
      `
        #### Price Oracle Proxy

        * "Deploy <Guardian:Address> <PriceOracle:Address> <vBNB:Address> <vUSDC:Address> <vSAI:Address> <vDAI:Address> <vUSDT:Address>" - The Price Oracle which proxies to a backing oracle
        * E.g. "PriceOracleProxy Deploy Admin (PriceOracle Address) vBNB vUSDC vSAI vDAI vUSDT"
      `,
      "PriceOracleProxy",
      [
        new Arg("guardian", getAddressV),
        new Arg("priceOracle", getAddressV),
        new Arg("vBNB", getAddressV),
        new Arg("vUSDC", getAddressV),
        new Arg("vSAI", getAddressV),
        new Arg("vDAI", getAddressV),
        new Arg("vUSDT", getAddressV),
      ],
      async (world, { guardian, priceOracle, vBNB, vUSDC, vSAI, vDAI, vUSDT }) => {
        return {
          invokation: await PriceOracleProxyContract.deploy<PriceOracleProxy>(world, from, [
            guardian.val,
            priceOracle.val,
            vBNB.val,
            vUSDC.val,
            vSAI.val,
            vDAI.val,
            vUSDT.val,
          ]),
          description: "Price Oracle Proxy",
          vBNB: vBNB.val,
          vUSDC: vUSDC.val,
          vSAI: vSAI.val,
          vDAI: vDAI.val,
          vUSDT: vUSDT.val,
        };
      },
      { catchall: true },
    ),
  ];

  const priceOracleProxyData = await getFetcherValue<any, PriceOracleProxyData>(
    "DeployPriceOracleProxy",
    fetchers,
    world,
    event,
  );
  const invokation = priceOracleProxyData.invokation!;
  delete priceOracleProxyData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const priceOracleProxy = invokation.value!;
  priceOracleProxyData.address = priceOracleProxy._address;

  world = await storeAndSaveContract(world, priceOracleProxy, "PriceOracleProxy", invokation, [
    { index: ["PriceOracleProxy"], data: priceOracleProxyData },
  ]);

  return { world, priceOracleProxy, invokation };
}
