const { makeComptroller, makeVToken, setMarketSupplyCap } = require("../Utils/Venus");

describe("VToken", function () {
  let root, accounts; // eslint-disable-line @typescript-eslint/no-unused-vars
  let vToken, oldComptroller, newComptroller;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    vToken = await makeVToken();
    oldComptroller = vToken.comptroller;
    newComptroller = await makeComptroller();
    expect(newComptroller._address).not.toEqual(oldComptroller._address);
    await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
  });

  describe("_setComptroller", () => {
    it("should fail if called by non-admin", async () => {
      expect(
        await send(vToken, "_setComptroller", [newComptroller._address], { from: accounts[0] }),
      ).toHaveTokenFailure("UNAUTHORIZED", "SET_COMPTROLLER_OWNER_CHECK");
      expect(await call(vToken, "comptroller")).toEqual(oldComptroller._address);
    });

    it("reverts if passed a contract that doesn't implement isComptroller", async () => {
      await expect(send(vToken, "_setComptroller", [vToken.underlying._address])).rejects.toRevert("revert");
      expect(await call(vToken, "comptroller")).toEqual(oldComptroller._address);
    });

    it("reverts if passed a contract that implements isComptroller as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badComptroller = await makeComptroller({ kind: "false-marker" });
      await expect(send(vToken, "_setComptroller", [badComptroller._address])).rejects.toRevert(
        "revert marker method returned false",
      );
      expect(await call(vToken, "comptroller")).toEqual(oldComptroller._address);
    });

    it("updates comptroller and emits log on success", async () => {
      const result = await send(vToken, "_setComptroller", [newComptroller._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog("NewComptroller", {
        oldComptroller: oldComptroller._address,
        newComptroller: newComptroller._address,
      });
      expect(await call(vToken, "comptroller")).toEqual(newComptroller._address);
    });
  });
});
