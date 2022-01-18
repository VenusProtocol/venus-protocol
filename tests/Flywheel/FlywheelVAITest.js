const {
  makeComptroller,
  makeVAI,
  balanceOf,
  fastForward,
  pretendVAIMint,
  quickMint,
  quickMintVAI
} = require('../Utils/Venus');
const {
  bnbExp,
  bnbDouble,
  bnbUnsigned
} = require('../Utils/BSC');

const venusVAIRate = bnbUnsigned(5e17);

async function venusAccrued(comptroller, user) {
  return bnbUnsigned(await call(comptroller, 'venusAccrued', [user]));
}

async function xvsBalance(comptroller, user) {
  return bnbUnsigned(await call(comptroller.xvs, 'balanceOf', [user]))
}

async function totalVenusAccrued(comptroller, user) {
  return (await venusAccrued(comptroller, user)).add(await xvsBalance(comptroller, user));
}


describe('Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let comptroller, vaicontroller, vai;
  beforeEach(async () => {
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    vai = comptroller.vai;
    vaicontroller = comptroller.vaiunitroller;
  });

  describe('claimVenus', () => {
    it('should accrue xvs and then transfer xvs accrued', async () => {
      const xvsRemaining = venusVAIRate.mul(100), mintAmount = bnbUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.xvs, 'transfer', [comptroller._address, xvsRemaining], {from: root});
      //await pretendVAIMint(vai, a1, 1);
      const speed = await call(comptroller, 'venusVAIRate');
      const a2AccruedPre = await venusAccrued(comptroller, a2);
      const xvsBalancePre = await xvsBalance(comptroller, a2);
      await quickMintVAI(comptroller, vai, a2, mintAmount);
      await fastForward(vaicontroller, deltaBlocks);
      const tx = await send(comptroller, 'claimVenus', [a2]);
      const a2AccruedPost = await venusAccrued(comptroller, a2);
      const xvsBalancePost = await xvsBalance(comptroller, a2);

      expect(tx.gasUsed).toBeLessThan(400000);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(xvsBalancePre).toEqualNumber(0);

      // vai rate is disabled!
      expect(speed).toEqualNumber(0); 
      expect(xvsBalancePost).toEqualNumber(0);
    });

    it('should claim when xvs accrued is below threshold', async () => {
      const xvsRemaining = bnbExp(1), accruedAmt = bnbUnsigned(0.0009e18)
      await send(comptroller.xvs, 'transfer', [comptroller._address, xvsRemaining], {from: root});
      await send(comptroller, 'setVenusAccrued', [a1, accruedAmt]);
      await send(comptroller, 'claimVenus', [a1]);
      expect(await venusAccrued(comptroller, a1)).toEqualNumber(accruedAmt);
      expect(await xvsBalance(comptroller, a1)).toEqualNumber(0);
    });
  });

  describe('claimVenus batch', () => {
    it('should claim the expected amount when holders and arg is duplicated', async () => {
      const xvsRemaining = venusVAIRate.mul(100), deltaBlocks = 10, mintAmount = bnbExp(10);
      await send(comptroller.xvs, 'transfer', [comptroller._address, xvsRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        await send(vai, 'harnessIncrementTotalSupply', [mintAmount]);
        expect(await send(vai, 'harnessSetBalanceOf', [from, mintAmount], { from })).toSucceed();
        expect(await await send(comptroller, 'harnessSetMintedVAIs', [from, mintAmount], { from })).toSucceed();
      }
      await fastForward(vaicontroller, deltaBlocks);

      const tx = await send(comptroller, 'claimVenus', [[...claimAccts, ...claimAccts], [], false, false]);
      // xvs distributed => 10e18
      for(let acct of claimAccts) {
        // vai minting is disabled!
        expect(await call(vaicontroller, 'venusVAIMinterIndex', [acct])).toEqualNumber(0);
        expect(await xvsBalance(comptroller, acct)).toEqualNumber(0);
      }
    });

    it('claims xvs for multiple vai minters only, primes uninitiated', async () => {
      const xvsRemaining = venusVAIRate.mul(100), deltaBlocks = 10, mintAmount = bnbExp(10), vaiAmt = bnbExp(1), vaiMintIdx = bnbExp(1)
      await send(comptroller.xvs, 'transfer', [comptroller._address, xvsRemaining], {from: root});
      let [_,__, ...claimAccts] = saddle.accounts;

      for(let acct of claimAccts) {
        await send(vai, 'harnessIncrementTotalSupply', [vaiAmt]);
        await send(vai, 'harnessSetBalanceOf', [acct, vaiAmt]);
        await send(comptroller, 'harnessSetMintedVAIs', [acct, vaiAmt]);
      }

      await send(vaicontroller, 'harnessFastForward', [10]);

      const tx = await send(comptroller, 'claimVenus', [claimAccts, [], false, false]);
      for(let acct of claimAccts) {
        // vai minting is disabled!
        expect(await call(vaicontroller, 'venusVAIMinterIndex', [acct])).toEqualNumber(0);
      }
    });
  });
});
