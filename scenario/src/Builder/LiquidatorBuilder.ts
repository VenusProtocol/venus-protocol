import {Event} from '../Event';
import {addAction, World} from '../World';
import {Liquidator} from '../Contract/Liquidator';
import {Invokation} from '../Invokation';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract} from '../Contract';
import {getAddressV, getNumberV} from '../CoreValue';
import {AddressV, NumberV} from '../Value';

const LiquidatorContract = getContract("Liquidator");

export interface LiquidatorData {
  invokation: Invokation<Liquidator>,
  description: string,
  vBnbAddress: string,
  address?: string
}

export async function buildLiquidator(world: World, from: string, event: Event): Promise<{world: World, liquidator: Liquidator, liquidatorData: LiquidatorData}> {
  const fetchers = [
    new Fetcher<{
        admin: AddressV,
        vBnb: AddressV,
        comptroller: AddressV,
        vaiController: AddressV,
        treasury: AddressV,
        treasuryPercentMantissa: NumberV
    }, LiquidatorData>(`
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
      async (world, {admin, vBnb, comptroller, vaiController, treasury, treasuryPercentMantissa}) => {
        return {
          invokation: await LiquidatorContract.deploy<Liquidator>(
            world, from,
            [admin.val, vBnb.val, comptroller.val, vaiController.val, treasury.val, treasuryPercentMantissa.encode()]
          ),
          description: "Liquidator",
          vBnbAddress: vBnb.val
        };
      },
      {catchall: true}
    )
  ];

  let liquidatorData = await getFetcherValue<any, LiquidatorData>("DeployLiquidator", fetchers, world, event);
  let invokation = liquidatorData.invokation;
  delete liquidatorData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const liquidator = invokation.value!;
  liquidatorData.address = liquidator._address;

  world = await storeAndSaveContract(
    world,
    liquidator,
    'Liquidator',
    invokation,
    [
      { index: ['Liquidator'], data: liquidatorData }
    ]
  );

  return {world, liquidator, liquidatorData};
}
