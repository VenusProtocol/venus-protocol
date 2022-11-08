const { makeVToken, getBalances, adjustBalances } = require("../Utils/Venus");

describe("VBNB", function () {
  let root, nonRoot;
  let vToken;
  beforeEach(async () => {
    [root, nonRoot] = saddle.accounts;
    vToken = await makeVToken({ kind: "vbnb", comptrollerOpts: { kind: "bool" } });
  });

  describe("getCashPrior", () => {
    it("returns the amount of bnb held by the vBnb contract before the current message", async () => {
      expect(await call(vToken, "harnessGetCashPrior", [], { value: 100 })).toEqualNumber(0);
    });
  });

  describe("doTransferIn", () => {
    it("succeeds if from is msg.nonRoot and amount is msg.value", async () => {
      expect(await call(vToken, "harnessDoTransferIn", [root, 100], { value: 100 })).toEqualNumber(100);
    });

    it("reverts if from != msg.sender", async () => {
      await expect(call(vToken, "harnessDoTransferIn", [nonRoot, 100], { value: 100 })).rejects.toRevert(
        "revert sender mismatch",
      );
    });

    it("reverts if amount != msg.value", async () => {
      await expect(call(vToken, "harnessDoTransferIn", [root, 77], { value: 100 })).rejects.toRevert(
        "revert value mismatch",
      );
    });

    describe("doTransferOut", () => {
      it("transfers bnb out", async () => {
        const beforeBalances = await getBalances([vToken], [nonRoot]);
        const receipt = await send(vToken, "harnessDoTransferOut", [nonRoot, 77], { value: 77 });
        const afterBalances = await getBalances([vToken], [nonRoot]);
        expect(receipt).toSucceed();
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [[vToken, nonRoot, "bnb", 77]]));
      });

      it("reverts if it fails", async () => {
        await expect(call(vToken, "harnessDoTransferOut", [root, 77], { value: 0 })).rejects.toRevert();
      });
    });
  });
});
