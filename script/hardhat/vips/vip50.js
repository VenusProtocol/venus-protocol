const { proposeAndVote } = require("../utils/voting");
const { deploy, getContractAt, impersonate } = require("../utils/misc");

const description = `# VIP-50

Upgrades timelock admin to GovernorBravo
`;

async function testVip() {
  const proposer = "0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D";
  const supporter = "0x60277add339d936c4ab907376afee4f7ac17d760";
  const multisig = "0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B";

  await impersonate(proposer);
  await impersonate(supporter);
  await impersonate(multisig);

  console.log("Deploying GovernorBravoDelegate...");
  const govBravoDelegate = await deploy("GovernorBravoDelegate").send({ from: proposer });
  console.log(`Deployed GovernorBravoDelegate to ${govBravoDelegate._address}`);

  console.log("Deploying GovernorBravoDelegator...");
  // The parameters are hardcoded intentionally — the same parameters
  // will be used in the actual deployment
  const govBravoDelegator = await deploy(
    "GovernorBravoDelegator",
    "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    "0x051100480289e704d20e9DB4804837068f3f9204",
    "0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B",
    govBravoDelegate._address,
    "86400",
    "1",
    "300000000000000000000000",
    "0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B",
  ).send({ from: proposer });
  console.log(`Deployed GovernorBravoDelegator to ${govBravoDelegator._address}`);

  const govBravo = getContractAt("GovernorBravoDelegate", govBravoDelegator._address);

  const vip50 = {
    signatures: ["setPendingAdmin(address)"],
    targets: ["0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396"],
    values: ["0"],
    params: [[govBravo._address]],
    description,
  };

  const timelock = getContractAt("Timelock", "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396");
  const govAlpha = getContractAt("GovernorAlpha2", "0x388313BfEFEE8ddfeAD55b585F62812293Cf3A60");
  await proposeAndVote({
    gov: govAlpha,
    proposal: vip50,
    proposer,
    supporter,
  });
  console.log("New Timelock **pending** admin is", await timelock.methods.pendingAdmin().call());

  // Lock team tokens

  // Initiate Bravo governance (bravo should become timelock admin)
  await govBravo.methods._initiate(govAlpha._address).send({ from: multisig });

  console.log("GovernorBravo: ", govBravo._address);
  console.log("Timelock admin: ", await timelock.methods.admin().call());
}

testVip()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
