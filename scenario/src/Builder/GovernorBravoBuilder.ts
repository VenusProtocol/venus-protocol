import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { GovernorBravo } from "../Contract/GovernorBravo";
import { getAddressV, getNumberV, getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV, NumberV, StringV } from "../Value";
import { World } from "../World";

const GovernorBravoDelegate = getContract("GovernorBravoDelegate");
const GovernorBravoDelegateHarness = getContract("GovernorBravoDelegateHarness");
const GovernorBravoDelegator = getContract("GovernorBravoDelegator");
const GovernorBravoImmutable = getContract("GovernorBravoImmutable");

export interface GovernorBravoData {
  invokation: Invokation<GovernorBravo>;
  name: string;
  contract: string;
  address?: string;
}

export async function buildGovernor(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; governor: GovernorBravo; govData: GovernorBravoData }> {
  const fetchers = [
    new Fetcher<
      {
        name: StringV;
        timelock: AddressV;
        xvsVault: AddressV;
        admin: AddressV;
        implementation: AddressV;
        votingPeriod: NumberV;
        votingDelay: NumberV;
        proposalThreshold: NumberV;
        guardian: AddressV;
      },
      GovernorBravoData
    >(
      `
      #### GovernorBravoDelegator
      * "GovernorBravo Deploy BravoDelegator name:<String> timelock:<Address> xvsVault:<Address> admin:<Address> implementation:<Address> votingPeriod:<Number> votingDelay:<Number> guardian:<Address>" - Deploys Venus Governor Bravo with a given parameters
        * E.g. "GovernorBravo Deploy BravoDelegator GovernorBravo (Address Timelock) (Address XVSVault) Admin (Address impl) 86400 1 Guardian"
    `,
      "BravoDelegator",
      [
        new Arg("name", getStringV),
        new Arg("timelock", getAddressV),
        new Arg("xvsVault", getAddressV),
        new Arg("admin", getAddressV),
        new Arg("implementation", getAddressV),
        new Arg("votingPeriod", getNumberV),
        new Arg("votingDelay", getNumberV),
        new Arg("proposalThreshold", getNumberV),
        new Arg("guardian", getAddressV),
      ],
      async (
        world,
        { name, timelock, xvsVault, admin, implementation, votingPeriod, votingDelay, proposalThreshold, guardian },
      ) => {
        return {
          invokation: await GovernorBravoDelegator.deploy<GovernorBravo>(world, from, [
            timelock.val,
            xvsVault.val,
            admin.val,
            implementation.val,
            votingPeriod.encode(),
            votingDelay.encode(),
            proposalThreshold.encode(),
            guardian.val,
          ]),
          name: name.val,
          contract: "GovernorBravoDelegator",
        };
      },
    ),
    new Fetcher<
      {
        name: StringV;
        timelock: AddressV;
        xvsVault: AddressV;
        admin: AddressV;
        votingPeriod: NumberV;
        votingDelay: NumberV;
        proposalThreshold: NumberV;
        guardian: AddressV;
      },
      GovernorBravoData
    >(
      `
      #### GovernorBravoImmutable
      * "GovernorBravoImmut Deploy BravoImmutable name:<String> timelock:<Address> xvsVault:<Address> admin:<Address> votingPeriod:<Number> votingDelay:<Number> guardian:<Address>" - Deploys Venus Governor Bravo Immutable with a given parameters
        * E.g. "GovernorBravo Deploy BravoImmutable GovernorBravo (Address Timelock) (Address XVSVault) Admin 86400 1 Guardian"
    `,
      "BravoImmutable",
      [
        new Arg("name", getStringV),
        new Arg("timelock", getAddressV),
        new Arg("xvsVault", getAddressV),
        new Arg("admin", getAddressV),
        new Arg("votingPeriod", getNumberV),
        new Arg("votingDelay", getNumberV),
        new Arg("proposalThreshold", getNumberV),
        new Arg("guardian", getAddressV),
      ],
      async (world, { name, timelock, xvsVault, admin, votingPeriod, votingDelay, proposalThreshold, guardian }) => {
        return {
          invokation: await GovernorBravoImmutable.deploy<GovernorBravo>(world, from, [
            timelock.val,
            xvsVault.val,
            admin.val,
            votingPeriod.encode(),
            votingDelay.encode(),
            proposalThreshold.encode(),
            guardian.val,
          ]),
          name: name.val,
          contract: "GovernorBravoImmutable",
        };
      },
    ),
    new Fetcher<{ name: StringV }, GovernorBravoData>(
      `
      #### GovernorBravoDelegate
      * "Governor Deploy BravoDelegate name:<String>" - Deploys Venus Governor Bravo Delegate
        * E.g. "Governor Deploy BravoDelegate GovernorBravoDelegate"
    `,
      "BravoDelegate",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await GovernorBravoDelegate.deploy<GovernorBravo>(world, from, []),
          name: name.val,
          contract: "GovernorBravoDelegate",
        };
      },
    ),
    new Fetcher<{ name: StringV }, GovernorBravoData>(
      `
      #### GovernorBravoDelegateHarness
      * "Governor Deploy BravoDelegateHarness name:<String>" - Deploys Venus Governor Bravo Delegate Harness
        * E.g. "Governor Deploy BravoDelegateHarness GovernorBravoDelegateHarness"
    `,
      "BravoDelegateHarness",
      [new Arg("name", getStringV)],
      async (world, { name }) => {
        return {
          invokation: await GovernorBravoDelegateHarness.deploy<GovernorBravo>(world, from, []),
          name: name.val,
          contract: "GovernorBravoDelegateHarness",
        };
      },
    ),
  ];

  const govData = await getFetcherValue<any, GovernorBravoData>("DeployGovernor", fetchers, world, params);
  const invokation = govData.invokation;
  delete govData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const governor = invokation.value!;
  govData.address = governor._address;

  world = await storeAndSaveContract(world, governor, govData.name, invokation, [
    { index: ["Governor", govData.name], data: govData },
  ]);

  return { world, governor, govData };
}
