import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { Liquidator } from "../Contract/Liquidator";
import { getAddressV, getNumberV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV, NumberV } from "../Value";
import { World } from "../World";

const LiquidatorContract = getContract("Liquidator");

export interface LiquidatorData {
  invokation: Invokation<Liquidator>;
  description: string;
  vBnbAddress: string;
  address?: string;
}

export async function buildLiquidator(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; liquidator: Liquidator; liquidatorData: LiquidatorData }> {
  const fetchers = [
    new Fetcher<
      {
        admin: AddressV;
        vBnb: AddressV;
        comptroller: AddressV;
        vaiController: AddressV;
        treasury: AddressV;
        treasuryPercentMantissa: NumberV;
      },
      LiquidatorData
    >(
      `
        #### Liquidator

        * "Liquidator Deploy admin:<Address> vBnb:<Address> comptroller:<Address> vaiController:<Address> treasury:<Address> treasuryPercentMantissa:<Number>"
      `,
      "Liquidator",
      [
        new Arg("admin", getAddressV),
        new Arg("vBnb", getAddressV),
        new Arg("comptroller", getAddressV),
        new Arg("vaiController", getAddressV),
        new Arg("treasury", getAddressV),
        new Arg("treasuryPercentMantissa", getNumberV),
      ],
      async (world, { admin, vBnb, comptroller, vaiController, treasury, treasuryPercentMantissa }) => {
        return {
          invokation: await LiquidatorContract.deploy<Liquidator>(world, from, [
            admin.val,
            vBnb.val,
            comptroller.val,
            vaiController.val,
            treasury.val,
            treasuryPercentMantissa.encode(),
          ]),
          description: "Liquidator",
          vBnbAddress: vBnb.val,
        };
      },
      { catchall: true },
    ),
  ];

  const liquidatorData = await getFetcherValue<any, LiquidatorData>("DeployLiquidator", fetchers, world, event);
  const invokation = liquidatorData.invokation;
  delete liquidatorData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const liquidator = invokation.value!;
  liquidatorData.address = liquidator._address;

  world = await storeAndSaveContract(world, liquidator, "Liquidator", invokation, [
    { index: ["Liquidator"], data: liquidatorData },
  ]);

  return { world, liquidator, liquidatorData };
}
