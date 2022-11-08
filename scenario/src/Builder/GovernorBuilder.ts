import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { Governor } from "../Contract/Governor";
import { getAddressV, getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { AddressV, StringV } from "../Value";
import { World } from "../World";

const GovernorAlphaContract = getContract("GovernorAlpha");
const GovernorAlphaHarnessContract = getContract("GovernorAlphaHarness");

export interface GovernorData {
  invokation: Invokation<Governor>;
  name: string;
  contract: string;
  address?: string;
}

export async function buildGovernor(
  world: World,
  from: string,
  params: Event,
): Promise<{ world: World; governor: Governor; govData: GovernorData }> {
  const fetchers = [
    new Fetcher<{ name: StringV; timelock: AddressV; xvs: AddressV; guardian: AddressV }, GovernorData>(
      `
      #### GovernorAlpha

      * "Governor Deploy Alpha name:<String> timelock:<Address> xvs:<Address> guardian:<Address>" - Deploys Venus Governor Alpha
        * E.g. "Governor Deploy Alpha GovernorAlpha (Address Timelock) (Address XVS) Guardian"
    `,
      "Alpha",
      [
        new Arg("name", getStringV),
        new Arg("timelock", getAddressV),
        new Arg("xvs", getAddressV),
        new Arg("guardian", getAddressV),
      ],
      async (world, { name, timelock, xvs, guardian }) => {
        return {
          invokation: await GovernorAlphaContract.deploy<Governor>(world, from, [timelock.val, xvs.val, guardian.val]),
          name: name.val,
          contract: "GovernorAlpha",
        };
      },
    ),
    new Fetcher<{ name: StringV; timelock: AddressV; xvs: AddressV; guardian: AddressV }, GovernorData>(
      `
      #### GovernorAlphaHarness

      * "Governor Deploy AlphaHarness name:<String> timelock:<Address> xvs:<Address> guardian:<Address>" - Deploys Venus Governor Alpha with a mocked voting period
        * E.g. "Governor Deploy AlphaHarness GovernorAlphaHarness (Address Timelock) (Address XVS) Guardian"
    `,
      "AlphaHarness",
      [
        new Arg("name", getStringV),
        new Arg("timelock", getAddressV),
        new Arg("xvs", getAddressV),
        new Arg("guardian", getAddressV),
      ],
      async (world, { name, timelock, xvs, guardian }) => {
        return {
          invokation: await GovernorAlphaHarnessContract.deploy<Governor>(world, from, [
            timelock.val,
            xvs.val,
            guardian.val,
          ]),
          name: name.val,
          contract: "GovernorAlphaHarness",
        };
      },
    ),
  ];

  const govData = await getFetcherValue<any, GovernorData>("DeployGovernor", fetchers, world, params);
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
