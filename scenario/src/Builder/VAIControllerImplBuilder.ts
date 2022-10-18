import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract, getTestContract } from "../Contract";
import { VAIControllerImpl } from "../Contract/VAIControllerImpl";
import { getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { StringV } from "../Value";
import { World } from "../World";

const VAIControllerScenarioContract = getTestContract("VAIControllerScenario");
const VAIControllerContract = getContract("VAIController");

const VAIControllerBorkedContract = getTestContract("VAIControllerBorked");

export interface VAIControllerImplData {
  invokation: Invokation<VAIControllerImpl>;
  name: string;
  contract: string;
  description: string;
}

export async function buildVAIControllerImpl(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; vaicontrollerImpl: VAIControllerImpl; vaicontrollerImplData: VAIControllerImplData }> {
  const fetchers = [
    new Fetcher<{ name: StringV }, VAIControllerImplData>(
      `
        #### Scenario

        * "Scenario name:<String>" - The VAIController Scenario for local testing
          * E.g. "VAIControllerImpl Deploy Scenario MyScen"
      `,
      "Scenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => ({
        invokation: await VAIControllerScenarioContract.deploy<VAIControllerImpl>(world, from, []),
        name: name.val,
        contract: "VAIControllerScenario",
        description: "Scenario VAIController Impl",
      }),
    ),

    new Fetcher<{ name: StringV }, VAIControllerImplData>(
      `
        #### Standard

        * "Standard name:<String>" - The standard VAIController contract
          * E.g. "VAIControllerImpl Deploy Standard MyStandard"
      `,
      "Standard",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await VAIControllerContract.deploy<VAIControllerImpl>(world, from, []),
          name: name.val,
          contract: "VAIController",
          description: "Standard VAIController Impl",
        };
      },
    ),

    new Fetcher<{ name: StringV }, VAIControllerImplData>(
      `
        #### Borked

        * "Borked name:<String>" - A Borked VAIController for testing
          * E.g. "VAIControllerImpl Deploy Borked MyBork"
      `,
      "Borked",
      [new Arg("name", getStringV)],
      async (world, { name }) => ({
        invokation: await VAIControllerBorkedContract.deploy<VAIControllerImpl>(world, from, []),
        name: name.val,
        contract: "VAIControllerBorked",
        description: "Borked VAIController Impl",
      }),
    ),
    new Fetcher<{ name: StringV }, VAIControllerImplData>(
      `
        #### Default

        * "name:<String>" - The standard VAIController contract
          * E.g. "VAIControllerImpl Deploy MyDefault"
      `,
      "Default",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        if (world.isLocalNetwork()) {
          // Note: we're going to use the scenario contract as the standard deployment on local networks
          return {
            invokation: await VAIControllerScenarioContract.deploy<VAIControllerImpl>(world, from, []),
            name: name.val,
            contract: "VAIControllerScenario",
            description: "Scenario VAIController Impl",
          };
        } else {
          return {
            invokation: await VAIControllerContract.deploy<VAIControllerImpl>(world, from, []),
            name: name.val,
            contract: "VAIController",
            description: "Standard VAIController Impl",
          };
        }
      },
      { catchall: true },
    ),
  ];

  const vaicontrollerImplData = await getFetcherValue<any, VAIControllerImplData>(
    "DeployVAIControllerImpl",
    fetchers,
    world,
    event,
  );
  const invokation = vaicontrollerImplData.invokation;
  delete vaicontrollerImplData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const vaicontrollerImpl = invokation.value!;

  world = await storeAndSaveContract(world, vaicontrollerImpl, vaicontrollerImplData.name, invokation, [
    {
      index: ["VAIController", vaicontrollerImplData.name],
      data: {
        address: vaicontrollerImpl._address,
        contract: vaicontrollerImplData.contract,
        description: vaicontrollerImplData.description,
      },
    },
  ]);

  return { world, vaicontrollerImpl, vaicontrollerImplData };
}
