const {
  both,
  bnbMantissa,
  encodeParameters,
  advanceBlocks,
  freezeTime,
  mineBlock,
  bnbUnsigned,
} = require("../../Utils/BSC");

describe("GovernorBravo#queue/1", () => {
  let root, a1, a2, guardian;

  async function enfranchise(xvs, xvsVault, actor, amount) {
    await send(xvsVault, "delegate", [actor], { from: actor });
    await send(xvs, "approve", [xvsVault._address, bnbMantissa(1e10)], { from: actor });
    // in test cases, we transfer enough token to actor for convenience
    await send(xvs, "transfer", [actor, bnbMantissa(amount)]);
    await send(xvsVault, "deposit", [xvs._address, 0, bnbMantissa(amount)], { from: actor });
  }

  async function makeVault(xvs, actor) {
    const xvsVault = await deploy("XVSVault", []);
    const xvsStore = await deploy("XVSStore", []);
    await send(xvsStore, "setNewOwner", [xvsVault._address], { from: actor });
    await send(xvsVault, "setXvsStore", [xvs._address, xvsStore._address], { from: actor });
    await send(xvsVault, "add", [xvs._address, 100, xvs._address, bnbUnsigned(1e16), 300], { from: actor }); // lock period 300s
    return xvsVault;
  }

  beforeAll(async () => {
    [root, a1, a2, guardian] = saddle.accounts;
  });

  describe("overlapping actions", () => {
    it("reverts on queueing overlapping actions in same proposal", async () => {
      const timelock = await deploy("TimelockHarness", [root, 86400 * 2]);
      const xvs = await deploy("XVS", [root]);
      const xvsVault = await makeVault(xvs, root);
      const gov = await deploy("GovernorBravoImmutable", [
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

      await enfranchise(xvs, xvsVault, a1, 3e6);
      await mineBlock();

      const targets = [xvs._address, xvs._address];
      const values = ["0", "0"];
      const signatures = ["getBalanceOf(address)", "getBalanceOf(address)"];
      const calldatas = [encodeParameters(["address"], [root]), encodeParameters(["address"], [root])];
      const { reply: proposalId1 } = await both(
        gov,
        "propose",
        [targets, values, signatures, calldatas, "do nothing"],
        { from: a1 },
      );
      await mineBlock();

      await send(gov, "castVote", [proposalId1, 1], { from: a1 });
      await advanceBlocks(90000);

      await expect(send(gov, "queue", [proposalId1])).rejects.toRevert(
        "revert GovernorBravo::queueOrRevertInternal: identical proposal action already queued at eta",
      );
    });

    it("reverts on queueing overlapping actions in different proposals, works if waiting", async () => {
      const timelock = await deploy("TimelockHarness", [root, 86400 * 2]);
      const xvs = await deploy("XVS", [root]);
      const xvsVault = await makeVault(xvs, root);
      const gov = await deploy("GovernorBravoImmutable", [
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

      await enfranchise(xvs, xvsVault, a1, 3e6);
      await enfranchise(xvs, xvsVault, a2, 3e6);
      await mineBlock();

      const targets = [xvs._address];
      const values = ["0"];
      const signatures = ["getBalanceOf(address)"];
      const calldatas = [encodeParameters(["address"], [root])];
      const { reply: proposalId1 } = await both(
        gov,
        "propose",
        [targets, values, signatures, calldatas, "do nothing"],
        { from: a1 },
      );
      const { reply: proposalId2 } = await both(
        gov,
        "propose",
        [targets, values, signatures, calldatas, "do nothing"],
        { from: a2 },
      );
      await mineBlock();

      await send(gov, "castVote", [proposalId1, 1], { from: a1 });
      await send(gov, "castVote", [proposalId2, 1], { from: a2 });
      await advanceBlocks(90000);
      await freezeTime(100);

      await send(gov, "queue", [proposalId1]);
      await expect(send(gov, "queue", [proposalId2])).rejects.toRevert(
        "revert GovernorBravo::queueOrRevertInternal: identical proposal action already queued at eta",
      );

      await freezeTime(101);
      await send(gov, "queue", [proposalId2]);
    });
  });
});
