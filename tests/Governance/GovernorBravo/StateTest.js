const {
  advanceBlocks,
  bnbUnsigned,
  both,
  encodeParameters,
  bnbMantissa,
  mineBlock,
  freezeTime,
  increaseTime,
} = require("../../Utils/BSC");

const path = require("path");
const solparse = require("solparse");

const governorBravoPath = path.join(__dirname, "../../..", "contracts", "Governance/GovernorBravoInterfaces.sol");
const statesInverted = solparse
  .parseFile(governorBravoPath)
  .body.find(k => k.name === "GovernorBravoDelegateStorageV1")
  .body.find(k => k.name == "ProposalState").members;

const states = Object.entries(statesInverted).reduce((obj, [key, value]) => ({ ...obj, [value]: key }), {});

let accounts = [];

describe("GovernorBravo#state/1", () => {
  let xvs, xvsVault, gov, root, acct, guardian, delay, timelock;

  async function enfranchise(actor, amount) {
    await send(xvsVault, "delegate", [actor], { from: actor });
    await send(xvs, "approve", [xvsVault._address, bnbMantissa(1e10)], { from: actor });
    // in test cases, we transfer enough token to actor for convenience
    await send(xvs, "transfer", [actor, bnbMantissa(amount)]);
    await send(xvsVault, "deposit", [xvs._address, 0, bnbMantissa(amount)], { from: actor });
  }

  beforeAll(async () => {
    await freezeTime(100);
    [root, acct, guardian, ...accounts] = accounts;
    xvs = await deploy("XVS", [root]);

    xvsVault = await deploy("XVSVault", []);
    const xvsStore = await deploy("XVSStore", []);
    await send(xvsStore, "setNewOwner", [xvsVault._address], { from: root });
    await send(xvsVault, "setXvsStore", [xvs._address, xvsStore._address], { from: root });
    await send(xvsVault, "add", [xvs._address, 100, xvs._address, bnbUnsigned(1e16), 300], { from: root }); // lock period 300s

    delay = bnbUnsigned(2 * 24 * 60 * 60).mul(2);
    timelock = await deploy("TimelockHarness", [root, delay]);

    gov = await deploy("GovernorBravoImmutable", [
      timelock._address,
      xvsVault._address,
      root,
      86400,
      1,
      "100000000000000000000000",
      guardian,
    ]);
    await send(gov, "_initiate");
    await send(timelock, "harnessSetAdmin", [gov._address]);

    await enfranchise(acct, 400001);
  });

  let trivialProposal, targets, values, signatures, callDatas;
  beforeAll(async () => {
    targets = [root];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(["address"], [acct])];

    await enfranchise(root, 400001);

    await send(gov, "propose", [targets, values, signatures, callDatas, "do nothing"]);
    const proposalId = await call(gov, "latestProposalIds", [root]);
    trivialProposal = await call(gov, "proposals", [proposalId]);
  });

  it("Invalid for proposal not found", async () => {
    await expect(call(gov, "state", ["5"])).rejects.toRevert("revert GovernorBravo::state: invalid proposal id");
  });

  it("Pending", async () => {
    expect(await call(gov, "state", [trivialProposal.id], {})).toEqual(states["Pending"]);
  });

  it("Active", async () => {
    await mineBlock();
    await mineBlock();
    expect(await call(gov, "state", [trivialProposal.id], {})).toEqual(states["Active"]);
  });

  it("Canceled", async () => {
    await enfranchise(accounts[0], 400000);
    await send(xvsVault, "delegate", [accounts[0]], { from: accounts[0] });
    await mineBlock();
    await send(gov, "propose", [targets, values, signatures, callDatas, "do nothing"], { from: accounts[0] });
    let newProposalId = await call(gov, "proposalCount");

    // send away the delegates
    await send(xvsVault, "delegate", [root], { from: accounts[0] });
    await send(gov, "cancel", [newProposalId]);

    expect(await call(gov, "state", [+newProposalId])).toEqual(states["Canceled"]);
  });

  it("Canceled by Guardian", async () => {
    await enfranchise(accounts[0], 400000);
    await send(xvsVault, "delegate", [accounts[0]], { from: accounts[0] });
    await mineBlock();
    await send(gov, "propose", [targets, values, signatures, callDatas, "do nothing"], { from: accounts[0] });
    let newProposalId = await call(gov, "proposalCount");

    // send away the delegates
    await send(xvsVault, "delegate", [root], { from: accounts[0] });
    await send(gov, "cancel", [newProposalId], { from: guardian });

    expect(await call(gov, "state", [+newProposalId])).toEqual(states["Canceled"]);
  });

  it("Defeated", async () => {
    // travel to end block
    await advanceBlocks(90000);

    expect(await call(gov, "state", [trivialProposal.id])).toEqual(states["Defeated"]);
  });

  it("Succeeded", async () => {
    await mineBlock();
    const { reply: newProposalId } = await both(
      gov,
      "propose",
      [targets, values, signatures, callDatas, "do nothing"],
      { from: acct },
    );
    await mineBlock();
    await send(gov, "castVote", [newProposalId, 1]);
    await advanceBlocks(90000);

    expect(await call(gov, "state", [newProposalId])).toEqual(states["Succeeded"]);
  });

  it("Queued", async () => {
    await mineBlock();
    const { reply: newProposalId } = await both(
      gov,
      "propose",
      [targets, values, signatures, callDatas, "do nothing"],
      { from: acct },
    );
    await mineBlock();
    await send(gov, "castVote", [newProposalId, 1]);
    await advanceBlocks(90000);

    await send(gov, "queue", [newProposalId], { from: acct });
    expect(await call(gov, "state", [newProposalId])).toEqual(states["Queued"]);
  });

  it("Expired", async () => {
    await mineBlock();
    const { reply: newProposalId } = await both(
      gov,
      "propose",
      [targets, values, signatures, callDatas, "do nothing"],
      { from: acct },
    );
    await mineBlock();
    await send(gov, "castVote", [newProposalId, 1]);
    await advanceBlocks(90000);

    await increaseTime(1);
    await send(gov, "queue", [newProposalId], { from: acct });

    let gracePeriod = await call(timelock, "GRACE_PERIOD");
    let p = await call(gov, "proposals", [newProposalId]);
    let eta = bnbUnsigned(p.eta);

    await freezeTime(eta.add(gracePeriod).sub(1).toNumber());

    expect(await call(gov, "state", [newProposalId])).toEqual(states["Queued"]);

    await freezeTime(eta.add(gracePeriod).toNumber());

    expect(await call(gov, "state", [newProposalId])).toEqual(states["Expired"]);
  });

  it("Executed", async () => {
    await mineBlock();
    const { reply: newProposalId } = await both(
      gov,
      "propose",
      [targets, values, signatures, callDatas, "do nothing"],
      { from: acct },
    );
    await mineBlock();
    await send(gov, "castVote", [newProposalId, 1]);
    await advanceBlocks(90000);

    await increaseTime(1);
    await send(gov, "queue", [newProposalId], { from: acct });

    let gracePeriod = await call(timelock, "GRACE_PERIOD");
    let p = await call(gov, "proposals", [newProposalId]);
    let eta = bnbUnsigned(p.eta);

    await freezeTime(eta.add(gracePeriod).sub(1).toNumber());

    expect(await call(gov, "state", [newProposalId])).toEqual(states["Queued"]);
    await send(gov, "execute", [newProposalId], { from: acct });

    expect(await call(gov, "state", [newProposalId])).toEqual(states["Executed"]);

    // still executed even though would be expired
    await freezeTime(eta.add(gracePeriod).toNumber());

    expect(await call(gov, "state", [newProposalId])).toEqual(states["Executed"]);
  });
});
