const {
  bnbUnsigned,
  freezeTime,
  advanceBlocks
} = require('../Utils/BSC');

const rewardPerBlock = bnbUnsigned(1e16);
const tokenAmount = bnbUnsigned(1e22);

describe('XVSVault', () => {
  let root, notAdmin;
  let blockTimestamp;
  let xvsVault;
  let xvsStore;
  let xvs;
  let sxp;

  beforeEach(async () => {
    [root, notAdmin, newAdmin] = accounts;

    xvsVault = await deploy('XVSVault', []);
    xvsStore = await deploy('XVSStore', []);
    xvs = await deploy('XVSScenario', [root]);
    sxp = await deploy('SXP', [root]);

    await send(xvsStore, 'setNewOwner', [xvsVault._address], { from: root });
    await send(xvsVault, 'setXvsStore', [xvs._address, xvsStore._address], { from: root });
    await send(xvsVault, 'setWithdrawalLockingPeriod', [300], { from: root });
    await send(xvs, 'transfer', [xvsStore._address, tokenAmount], { from: root });
    await send(sxp, 'transfer', [xvsStore._address, tokenAmount], { from: root });

    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber())
  });

  describe('xvs store', () => {
    it('check xvs balance', async () => {
      let xvsBalanceOfStore = await call(xvs, 'balanceOf', [xvsStore._address]);
      expect(xvsBalanceOfStore).toEqual('10000000000000000000000');
    });

    it('set new reward token', async () => {
      await send(xvsStore, 'setRewardToken', [xvs._address, true], { from: root });
      expect(await call(xvsStore, 'rewardTokens', [xvs._address])).toEqual(true);
      expect(await call(xvsStore, 'rewardTokens', [xvsVault._address])).toEqual(false);
      expect(await call(xvsStore, 'rewardTokens', [xvsStore._address])).toEqual(false);

      await send(xvsStore, 'setRewardToken', [xvs._address, false], { from: root });
      expect(await call(xvsStore, 'rewardTokens', [xvsStore._address])).toEqual(false);
    });

    it('tranfer reward token', async () => {
      await expect(
        send(xvsStore, 'safeRewardTransfer', [xvs._address, root, tokenAmount], { from: root })
      ).rejects.toRevert('revert only owner can');
    });
  });
  
  describe('check xvs vault config', () => {
    it('check xvs vault admin', async () => {
      expect(await call(xvsVault, 'getAdmin', [])).toEqual(root);
    });

    it('check xvs token address', async () => {
      expect(await call(xvsVault, 'xvsAddress', [])).toEqual(xvs._address);
    });

    it('check xvs store address', async () => {
      expect(await call(xvsVault, 'xvsStore', [])).toEqual(xvsStore._address);
    });

    it('check withdrawal unlock period', async () => {
      expect(await call(xvsVault, 'lockPeriod', [])).toEqual("300");
    });
  });

  describe('test to manage reward pool config', () => {
    it('add xvs pool', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0], { from: root });
      
      const poolInfo = await call(xvsVault, 'poolInfos', [xvs._address, 0]);
      expect(poolInfo['token']).toEqual(xvs._address);
      expect(poolInfo['allocPoint']).toEqual('100');
      expect(poolInfo['accRewardPerShare']).toEqual('0');

      expect(await call(xvsStore, 'rewardTokens', [xvs._address])).toEqual(true);
    });

    it('update xvs pool alloc coing', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0], { from: root });

      let poolInfo = await call(xvsVault, 'poolInfos', [xvs._address, 0]);
      expect(poolInfo['allocPoint']).toEqual('100');

      await send(xvsVault, 'set', [
        xvs._address,
        0,
        1000,
        0], { from: root });
      
      poolInfo = await call(xvsVault, 'poolInfos', [xvs._address, 0]);
      expect(poolInfo['token']).toEqual(xvs._address);
      expect(poolInfo['allocPoint']).toEqual('1000');
      expect(poolInfo['accRewardPerShare']).toEqual('0');

      expect(await call(xvsStore, 'rewardTokens', [xvs._address])).toEqual(true);
    });
  });

  describe('deposit xvs token', () => {
    it('add xvs pool', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvs, 'transfer', [notAdmin, tokenAmount], { from: root });

      const notAdminXvsBal = await call(xvs, 'balanceOf', [notAdmin]);
      expect(notAdminXvsBal).toEqual('10000000000000000000000');

      await send(xvs, 'approve', [xvsVault._address, tokenAmount], { from: notAdmin });

      const notAdminAppr = await call(xvs, 'allowance', [notAdmin, xvsVault._address]);
      expect(notAdminAppr).toEqual('10000000000000000000000');
      
      await send(xvsVault, 'deposit', [xvs._address, 0, tokenAmount], { from: notAdmin });

      const depositedAmount = await call(xvs, 'balanceOf', [xvsVault._address]);
      expect(depositedAmount).toEqual('10000000000000000000000');

      let userInfo = await call(xvsVault, 'getUserInfo', [xvs._address, 0, notAdmin]);
      expect(userInfo['amount']).toEqual('10000000000000000000000');
      expect(userInfo['rewardDebt']).toEqual('0');

      userInfo = await call(xvsVault, 'getUserInfo', [sxp._address, 0, notAdmin]);
      expect(userInfo['amount']).toEqual('0');
      expect(userInfo['rewardDebt']).toEqual('0');
    });
  });

  describe('claim xvs reward', () => {
    it('deposit and claim', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvs, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(xvs, 'approve', [xvsVault._address, tokenAmount], { from: notAdmin });
      await send(xvsVault, 'deposit', [xvs._address, 0, tokenAmount], { from: notAdmin });

      await freezeTime(200);

      let xvsBalance = await call(xvs, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('0');

      await send(xvsVault, 'deposit', [xvs._address, 0, 0], { from: notAdmin });

      xvsBalance = await call(xvs, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('20000000000000000');
    });
  });

  describe('withdraw xvs token', () => {
    it('request and execute withdrawal', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvs, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(xvs, 'approve', [xvsVault._address, tokenAmount], { from: notAdmin });
      await send(xvsVault, 'deposit', [xvs._address, 0, tokenAmount], { from: notAdmin });

      await send(xvsVault, 'requestWithdrawal', [xvs._address, 0, tokenAmount.div(2)], { from: notAdmin });

      let eligibleAmount = await call(xvsVault, 'getEligibleWithdrawalAmount', [xvs._address, 0, notAdmin]);
      let requestAmount = await call(xvsVault, 'getRequestedAmount', [xvs._address, 0, notAdmin]);
      let withdrawalInfo = await call(xvsVault, 'getWithdrawalInfo', [xvs._address, 0, notAdmin]);
      
      expect(eligibleAmount).toEqual('0');
      expect(requestAmount).toEqual('5000000000000000000000');
      
      expect(withdrawalInfo['amount']).toEqual('5000000000000000000000');
      expect(withdrawalInfo['startTimestamp']).toEqual('100');
      expect(withdrawalInfo['endTimestamp']).toEqual('400');
      
      await freezeTime(300);

      eligibleAmount = await call(xvsVault, 'getEligibleWithdrawalAmount', [xvs._address, 0, notAdmin]);
      requestAmount = await call(xvsVault, 'getRequestedAmount', [xvs._address, 0, notAdmin]);
      expect(eligibleAmount).toEqual('0');
      expect(requestAmount).toEqual('5000000000000000000000');
      
      await freezeTime(401);

      eligibleAmount = await call(xvsVault, 'getEligibleWithdrawalAmount', [xvs._address, 0, notAdmin]);
      requestAmount = await call(xvsVault, 'getRequestedAmount', [xvs._address, 0, notAdmin]);
      expect(eligibleAmount).toEqual('5000000000000000000000');
      expect(requestAmount).toEqual('5000000000000000000000');

      let xvsBalance = await call(xvs, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('0');

      await send(xvsVault, 'executeWithdrawal', [xvs._address, 0], { from: notAdmin });

      xvsBalance = await call(xvs, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('5000040000000000000000');
    });
  });

  describe('multiple pools', () => {
    it('add xvs and sxp reward pools', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        sxp._address,
        rewardPerBlock,
        0
      ], { from: root });

      await send(xvsVault, 'add', [
        sxp._address,
        200,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvsVault, 'add', [
        sxp._address,
        200,
        sxp._address,
        rewardPerBlock,
        0
      ], { from: root });

      const totalAllocPoint1 = await call(xvsVault, 'totalAllocPoints', [xvs._address]);
      expect(totalAllocPoint1).toEqual('200');

      const totalAllocPoint2 = await call(xvsVault, 'totalAllocPoints', [sxp._address]);
      expect(totalAllocPoint2).toEqual('400');
    });

    it('deposit xvs and sxp reward pools', async () => {
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvsVault, 'add', [
        xvs._address,
        100,
        sxp._address,
        rewardPerBlock,
        0
      ], { from: root });

      await send(xvsVault, 'add', [
        sxp._address,
        200,
        xvs._address,
        rewardPerBlock,
        0
      ], { from: root });
      await send(xvsVault, 'add', [
        sxp._address,
        200,
        sxp._address,
        rewardPerBlock,
        0
      ], { from: root });

      await send(xvs, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(xvs, 'approve', [xvsVault._address, tokenAmount], { from: notAdmin });
      await send(xvsVault, 'deposit', [xvs._address, 0, tokenAmount], { from: notAdmin });

      await send(sxp, 'transfer', [notAdmin, tokenAmount], { from: root });
      await send(sxp, 'approve', [xvsVault._address, tokenAmount], { from: notAdmin });
      await send(xvsVault, 'deposit', [sxp._address, 1, tokenAmount], { from: notAdmin });

      let xvsBalance = await call(xvs, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('0');

      await send(xvsVault, 'deposit', [xvs._address, 0, 0], { from: notAdmin });

      xvsBalance = await call(xvs, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('20000000000000000');

      let sxpBalance = await call(sxp, 'balanceOf', [notAdmin]);
      expect(sxpBalance).toEqual('0');

      await send(xvsVault, 'deposit', [sxp._address, 1, 0], { from: notAdmin });

      xvsBalance = await call(sxp, 'balanceOf', [notAdmin]);
      expect(xvsBalance).toEqual('10000000000000000');
    });
  });

  // describe('get prior votes', () => {
  //   it('check votes value', async () => {
  //     await send(xvsVault, 'add', [xvs._address, 100, xvs._address, rewardPerBlock, 0], { from: root });
  //     await send(xvs, 'transfer', [notAdmin, tokenAmount], { from: root });
  //     await send(xvs, 'approve', [xvsVault._address, tokenAmount], { from: notAdmin });
  //     await send(xvsVault, 'deposit', [xvs._address, 0, tokenAmount], { from: notAdmin });      

  //     const votes = await call(xvsVault, 'getPriorVotes', [notAdmin, 0]);
  //     expect(votes).toEqual('10000000000000000000000');
  //   });
  // });
});
