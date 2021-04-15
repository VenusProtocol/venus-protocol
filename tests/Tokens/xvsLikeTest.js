const {
  makeVToken,
} = require('../Utils/Venus');
  
describe('VXvsLikeDelegate', function () {
  describe("_delegateXvsLikeTo", () => {
    it("does not delegate if not the admin", async () => {
      const [root, a1] = saddle.accounts;
      const vToken = await makeVToken({kind: 'vxvs'});
      await expect(send(vToken, '_delegateXvsLikeTo', [a1], {from: a1})).rejects.toRevert('revert only the admin may set the xvs-like delegate');
    });

    it("delegates successfully if the admin", async () => {
      const [root, a1] = saddle.accounts, amount = 1;
      const vXVS = await makeVToken({kind: 'vxvs'}), XVS = vXVS.underlying;
      const tx1 = await send(vXVS, '_delegateXvsLikeTo', [a1]);
      const tx2 = await send(XVS, 'transfer', [vXVS._address, amount]);
      await expect(await call(XVS, 'getCurrentVotes', [a1])).toEqualNumber(amount);
    });
  });
});
