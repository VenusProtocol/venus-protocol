import { Event } from '../Event';
import { addAction, World } from '../World';
import { ComptrollerImpl } from '../Contract/ComptrollerImpl';
import { Invokation, invoke } from '../Invokation';
import { getAddressV, getExpNumberV, getNumberV, getStringV } from '../CoreValue';
import { AddressV, NumberV, StringV } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract, getTestContract } from '../Contract';

const ComptrollerScenarioContract = getTestContract('ComptrollerScenario');
const ComptrollerContract = getContract('Comptroller');

const ComptrollerBorkedContract = getTestContract('ComptrollerBorked');

export interface ComptrollerImplData {
  invokation: Invokation<ComptrollerImpl>;
  name: string;
  contract: string;
  description: string;
}

export async function buildComptrollerImpl(
  world: World,
  from: string,
  event: Event
): Promise<{ world: World; comptrollerImpl: ComptrollerImpl; comptrollerImplData: ComptrollerImplData }> {
  const fetchers = [
    new Fetcher<{ name: StringV }, ComptrollerImplData>(
      `
        #### Scenario

        * "Scenario name:<String>" - The Comptroller Scenario for local testing
          * E.g. "ComptrollerImpl Deploy Scenario MyScen"
      `,
      'Scenario',
      [new Arg('name', getStringV)],
      async (world, { name }) => ({
        invokation: await ComptrollerScenarioContract.deploy<ComptrollerImpl>(world, from, []),
        name: name.val,
        contract: 'ComptrollerScenario',
        description: 'Scenario Comptroller Impl'
      })
    ),

    new Fetcher<{ name: StringV }, ComptrollerImplData>(
      `
        #### Standard

        * "Standard name:<String>" - The standard Comptroller contract
          * E.g. "ComptrollerImpl Deploy Standard MyStandard"
      `,
      'Standard',
      [new Arg('name', getStringV)],
      async (world, { name }) => {
        return {
          invokation: await ComptrollerContract.deploy<ComptrollerImpl>(world, from, []),
          name: name.val,
          contract: 'Comptroller',
          description: 'Standard Comptroller Impl'
        };
      }
    ),

    new Fetcher<{ name: StringV }, ComptrollerImplData>(
      `
        #### Borked

        * "Borked name:<String>" - A Borked Comptroller for testing
          * E.g. "ComptrollerImpl Deploy Borked MyBork"
      `,
      'Borked',
      [new Arg('name', getStringV)],
      async (world, { name }) => ({
        invokation: await ComptrollerBorkedContract.deploy<ComptrollerImpl>(world, from, []),
        name: name.val,
        contract: 'ComptrollerBorked',
        description: 'Borked Comptroller Impl'
      })
    ),
    new Fetcher<{ name: StringV }, ComptrollerImplData>(
      `
        #### Default

        * "name:<String>" - The standard Comptroller contract
          * E.g. "ComptrollerImpl Deploy MyDefault"
      `,
      'Default',
      [new Arg('name', getStringV)],
      async (world, { name }) => {
        if (world.isLocalNetwork()) {
          // Note: we're going to use the scenario contract as the standard deployment on local networks
          return {
            invokation: await ComptrollerScenarioContract.deploy<ComptrollerImpl>(world, from, []),
            name: name.val,
            contract: 'ComptrollerScenario',
            description: 'Scenario Comptroller Impl'
          };
        } else {
          return {
            invokation: await ComptrollerContract.deploy<ComptrollerImpl>(world, from, []),
            name: name.val,
            contract: 'Comptroller',
            description: 'Standard Comptroller Impl'
          };
        }
      },
      { catchall: true }
    )
  ];

  let comptrollerImplData = await getFetcherValue<any, ComptrollerImplData>(
    'DeployComptrollerImpl',
    fetchers,
    world,
    event
  );
  let invokation = comptrollerImplData.invokation;
  delete comptrollerImplData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const comptrollerImpl = invokation.value!;

  world = await storeAndSaveContract(world, comptrollerImpl, comptrollerImplData.name, invokation, [
    {
      index: ['Comptroller', comptrollerImplData.name],
      data: {
        address: comptrollerImpl._address,
        contract: comptrollerImplData.contract,
        description: comptrollerImplData.description
      }
    }
  ]);

  return { world, comptrollerImpl, comptrollerImplData };
}
