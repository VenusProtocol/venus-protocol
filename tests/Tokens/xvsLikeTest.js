const { makeVToken, setMarketSupplyCap } = require("../Utils/Venus");

describe("VXvsLikeDelegate", function () {
  describe("_delegateXvsLikeTo", () => {
    it("does not delegate if not the admin", async () => {
      const [root, a1] = saddle.accounts; // eslint-disable-line @typescript-eslint/no-unused-vars
      const vToken = await makeVToken({ kind: "vxvs" });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      await expect(send(vToken, "_delegateXvsLikeTo", [a1], { from: a1 })).rejects.toRevert(
        "revert only the admin may set the xvs-like delegate",
      );
    });

    it("delegates successfully if the admin", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [root, a1] = saddle.accounts,
        amount = 1;
      const vXVS = await makeVToken({ kind: "vxvs" }),
        XVS = vXVS.underlying;
      await send(vXVS, "_delegateXvsLikeTo", [a1]);
      await send(XVS, "transfer", [vXVS._address, amount]);
      await expect(await call(XVS, "getCurrentVotes", [a1])).toEqualNumber(amount);
    });
  });
});
