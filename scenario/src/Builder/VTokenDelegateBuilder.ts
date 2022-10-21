import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract, getTestContract } from "../Contract";
import { VBep20Delegate, VBep20DelegateScenario } from "../Contract/VBep20Delegate";
import { getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { StringV } from "../Value";
import { World } from "../World";

const VDaiDelegateContract = getContract("VDaiDelegate");
const VDaiDelegateScenarioContract = getTestContract("VDaiDelegateScenario");
const VBep20DelegateContract = getContract("VBep20Delegate");
const VBep20DelegateScenarioContract = getTestContract("VBep20DelegateScenario");

export interface VTokenDelegateData {
  invokation: Invokation<VBep20Delegate>;
  name: string;
  contract: string;
  description?: string;
}

export async function buildVTokenDelegate(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; vTokenDelegate: VBep20Delegate; delegateData: VTokenDelegateData }> {
  const fetchers = [
    new Fetcher<{ name: StringV }, VTokenDelegateData>(
      `
        #### VDaiDelegate

        * "VDaiDelegate name:<String>"
          * E.g. "VTokenDelegate Deploy VDaiDelegate vDAIDelegate"
      `,
      "VDaiDelegate",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await VDaiDelegateContract.deploy<VBep20Delegate>(world, from, []),
          name: name.val,
          contract: "VDaiDelegate",
          description: "Standard VDai Delegate",
        };
      },
    ),

    new Fetcher<{ name: StringV }, VTokenDelegateData>(
      `
        #### VDaiDelegateScenario

        * "VDaiDelegateScenario name:<String>" - A VDaiDelegate Scenario for local testing
          * E.g. "VTokenDelegate Deploy VDaiDelegateScenario vDAIDelegate"
      `,
      "VDaiDelegateScenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await VDaiDelegateScenarioContract.deploy<VBep20DelegateScenario>(world, from, []),
          name: name.val,
          contract: "VDaiDelegateScenario",
          description: "Scenario VDai Delegate",
        };
      },
    ),

    new Fetcher<{ name: StringV }, VTokenDelegateData>(
      `
        #### VBep20Delegate

        * "VBep20Delegate name:<String>"
          * E.g. "VTokenDelegate Deploy VBep20Delegate vDAIDelegate"
      `,
      "VBep20Delegate",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await VBep20DelegateContract.deploy<VBep20Delegate>(world, from, []),
          name: name.val,
          contract: "VBep20Delegate",
          description: "Standard VBep20 Delegate",
        };
      },
    ),

    new Fetcher<{ name: StringV }, VTokenDelegateData>(
      `
        #### VBep20DelegateScenario

        * "VBep20DelegateScenario name:<String>" - A VBep20Delegate Scenario for local testing
          * E.g. "VTokenDelegate Deploy VBep20DelegateScenario vDAIDelegate"
      `,
      "VBep20DelegateScenario",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await VBep20DelegateScenarioContract.deploy<VBep20DelegateScenario>(world, from, []),
          name: name.val,
          contract: "VBep20DelegateScenario",
          description: "Scenario VBep20 Delegate",
        };
      },
    ),
  ];

  const delegateData = await getFetcherValue<any, VTokenDelegateData>("DeployVToken", fetchers, world, params);
  const invokation = delegateData.invokation;
  delete delegateData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const vTokenDelegate = invokation.value!;

  world = await storeAndSaveContract(world, vTokenDelegate, delegateData.name, invokation, [
    {
      index: ["VTokenDelegate", delegateData.name],
      data: {
        address: vTokenDelegate._address,
        contract: delegateData.contract,
        description: delegateData.description,
      },
    },
  ]);

  return { world, vTokenDelegate, delegateData };
}
