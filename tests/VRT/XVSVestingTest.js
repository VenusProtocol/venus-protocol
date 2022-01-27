const BigNumber = require('bignumber.js');
const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime,
  address
} = require('../Utils/BSC');

const BLOCKS_PER_DAY = (new BigNumber(24).multipliedBy(new BigNumber(3600))).dividedToIntegerBy(new BigNumber(3));
const VESTING_PERIOD = new BigNumber(360).multipliedBy(BLOCKS_PER_DAY);

const calculatedExpectedWithdrawalAmount = (totalVestedAmount, withdrawnAmount, startBlock, blockNumber) => {
  const blockDiff = new BigNumber(blockNumber).minus(new BigNumber(startBlock));
  const unlockedAmount = (new BigNumber(totalVestedAmount).multipliedBy(blockDiff)).dividedToIntegerBy(VESTING_PERIOD);
  const amount = new BigNumber(totalVestedAmount).minus(new BigNumber(withdrawnAmount));
  return (amount.isGreaterThanOrEqualTo(unlockedAmount) ? unlockedAmount : amount);
};

const getBlocksbyDays = (numberOfDays) => {
  return (BLOCKS_PER_DAY.multipliedBy(new BigNumber(numberOfDays)));
}

const setBlockNumber = async (xvsVesting, blockNumber) => {
  await send(xvsVesting, 'setBlockNumber', [bnbUnsigned(blockNumber)]);
}

const incrementBlocks = async (xvsVesting, deltaBlocks) => {
  const blockNumberInVestingContract = await call(xvsVesting, 'getBlockNumber');
  const blockNumber = new BigNumber(blockNumberInVestingContract).plus(new BigNumber(deltaBlocks));
  await setBlockNumber(xvsVesting, [blockNumber]);
}

const getBlockNumber = async (xvsVesting) => {
  const blockNumber = await call(xvsVesting, 'getBlockNumber');
  return blockNumber;
}

describe('XVSVesting', () => {
  let root, alice, bob, redeemerAddress, randomAddress;
  let vrtConversion, vrtConversionAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp, delay = 10;
  let conversionRatio, conversionRatioMultiplier, conversionStartTime, vrtDailyLimit, vrtTotalSupply;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint, xvsTokenMintAmount;
  let xvsVesting, xvsVestingAddress;

  beforeEach(async () => {
    [root, alice, bob, vrtConversionAddress, redeemerAddress, randomAddress, ...accounts] = saddle.accounts;
    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;
    conversionRatioMultiplier = 0.75;
    conversionRatio = new BigNumber(0.75e18);
    vrtTotalSupply = bnbMantissa(2000000000);

    //deploy VRT
    vrtToken = await deploy('VRT', [root]);

    vrtTokenAddress = vrtToken._address;
    vrtForMint = bnbMantissa(200000);
    await send(vrtToken, 'transfer', [root, vrtForMint], { from: root });

    vrtFundingAmount = bnbMantissa(100000);

    // Transfer BEP20 to alice
    await send(vrtToken, 'transfer', [alice, vrtFundingAmount], { from: root });

    // Transfer BEP20 to bob
    await send(vrtToken, 'transfer', [bob, vrtFundingAmount], { from: root });

    //deploy XVS
    xvsToken = await deploy('XVS', [root]);
    xvsTokenAddress = xvsToken._address;

    xvsVesting = await deploy('XVSVestingHarness', [xvsTokenAddress]);
    xvsVestingAddress = xvsVesting._address;

    xvsTokenMintAmount = bnbMantissa(100000);
    await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });
    await send(xvsVesting, '_setVrtConversion', [vrtConversionAddress], { from: root });
  });

  describe("constructor", () => {

    it("sets vrtConversion Address in XVSVesting", async () => {
      let vrtConversionAddressActual = await call(xvsVesting, "vrtConversionAddress");
      expect(vrtConversionAddressActual).toEqual(vrtConversionAddress);
    });

    it("sets XVS Address in XVSVesting", async () => {
      let xvsAddressActual = await call(xvsVesting, "xvs");
      expect(xvsAddressActual).toEqual(xvsTokenAddress);
    });
  });

  describe("Vest XVS", () => {

    it("deposit XVS", async () => {

      const redeemAmount = bnbMantissa(1000);

      let blockNumber = 0;
      await setBlockNumber(xvsVesting, blockNumber);
      //await send(xvsVesting, 'setBlockNumber', [blockNumber]);

      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemAmount], { from: root });

      //let deltaBlocks = 1;
      //await send(xvsVesting, 'setBlockNumber', [bnbUnsigned(blockNumber) + bnbUnsigned(deltaBlocks)]);
      await incrementBlocks(xvsVesting, 1);

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      let vestingStartBlock = await call(xvsVesting, 'getBlockNumber', []);
      const blocknumberAfterVesting = vestingStartBlock;

      const expectedWithdrawalAmount = calculatedExpectedWithdrawalAmount(redeemAmount, 0, vestingStartBlock, blocknumberAfterVesting);
      const depositTxn = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount], { from: vrtConversionAddress });

      expect(depositTxn).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: redeemAmount.toFixed(),
        withdrawnAmount: new BigNumber(expectedWithdrawalAmount),
        vestingStartBlock: vestingStartBlock
      });

    });

    it("Multiple XVS-Vestings with 10000 blocks Advancement", async () => {

      const redeemAmount_Vesting_1 = bnbMantissa(100);
      let blockNumber = 0;
      await setBlockNumber(xvsVesting, blockNumber);

      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemAmount_Vesting_1], { from: root });
      await incrementBlocks(xvsVesting, 1);

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const vestingStartBlock_Vesting_1 = await getBlockNumber(xvsVesting);
      let depositTxn_Vesting_1 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const blocknumberAfter_Vesting_1 = vestingStartBlock_Vesting_1;
      const expectedWithdrawalAmount_Vesting_1 =
        calculatedExpectedWithdrawalAmount(redeemAmount_Vesting_1, 0, vestingStartBlock_Vesting_1, blocknumberAfter_Vesting_1);

      expect(depositTxn_Vesting_1).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: redeemAmount_Vesting_1,
        withdrawnAmount: BigNumber(expectedWithdrawalAmount_Vesting_1),
        vestingStartBlock: vestingStartBlock_Vesting_1
      });

      await incrementBlocks(xvsVesting, 10000);

      const redeemAmount_Vesting_2 = bnbMantissa(100);
      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_2], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      //withdrawnAmount After Vesting-1
      const vestingRecord_After_Vesting_1 = await call(xvsVesting, 'vestings', [redeemerAddress]);

      const vestingStartBlock_Vesting_2 = await getBlockNumber(xvsVesting);
      depositTxn_Vesting_2 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_2], { from: vrtConversionAddress });
      const blocknumberAfter_Vesting_2 = await getBlockNumber(xvsVesting);

      const expectedVestedAmount_Vesting_2 = BigNumber.sum.apply(null, [redeemAmount_Vesting_1, redeemAmount_Vesting_2]);
      const expectedWithdrawalAmount_Vesting_2 =
        calculatedExpectedWithdrawalAmount(
          expectedVestedAmount_Vesting_2,
          0,
          vestingRecord_After_Vesting_1["vestingStartBlock"],
          blocknumberAfter_Vesting_2);

      expect(depositTxn_Vesting_2).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: expectedVestedAmount_Vesting_2,
        vestingStartBlock: vestingStartBlock_Vesting_2,
        "withdrawnAmount": new BigNumber(expectedWithdrawalAmount_Vesting_2)
      });

    });

    it("Multiple XVS-Vestings - with a Vesting after 360 Days of 1st Vesting", async () => {

      const redeemAmount_Vesting_1 = bnbMantissa(100);
      let blockNumber = 0;
      await setBlockNumber(xvsVesting, blockNumber);

      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemAmount_Vesting_1], { from: root });
      await incrementBlocks(xvsVesting, 1);

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const xvsBalance_Before_Vesting_1 = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);

      const vestingStartBlock_Vesting_1 = await getBlockNumber(xvsVesting);
      let depositTxn_Vesting_1 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const blocknumberAfter_Vesting_1 = vestingStartBlock_Vesting_1;
      const expectedWithdrawalAmount_Vesting_1 =
        calculatedExpectedWithdrawalAmount(redeemAmount_Vesting_1, 0, vestingStartBlock_Vesting_1, blocknumberAfter_Vesting_1);

      expect(depositTxn_Vesting_1).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: redeemAmount_Vesting_1,
        withdrawnAmount: BigNumber(expectedWithdrawalAmount_Vesting_1),
        vestingStartBlock: vestingStartBlock_Vesting_1
      });

      const xvsBalance_of_XVSVesting_After_Vesting_1 = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);
      expect(new BigNumber(xvsBalance_of_XVSVesting_After_Vesting_1).isEqualTo(new BigNumber(xvsBalance_Before_Vesting_1).plus(redeemAmount_Vesting_1)));

      const xvsBalance_Of_Redeemer_After_Vesting_1 = await call(xvsToken, 'balanceOf', [redeemerAddress]);
      expect(new BigNumber(xvsBalance_Of_Redeemer_After_Vesting_1).isEqualTo(0));

      // Advance by 360 Days
      await incrementBlocks(xvsVesting, getBlocksbyDays(360));

      const redeemAmount_Vesting_2 = bnbMantissa(100);

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_2], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      //withdrawnAmount After Vesting-1
      const vestingRecord_After_Vesting_1 = await call(xvsVesting, 'vestings', [redeemerAddress]);

      const vestingStartBlock_Vesting_2 = await getBlockNumber(xvsVesting);
      depositTxn_Vesting_2 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_2], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const xvsBalance_Of_XVSVesting_After_Vesting_2 = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);
      expect(new BigNumber(xvsBalance_Of_XVSVesting_After_Vesting_2).isEqualTo(new BigNumber(0)));

      const expected_TotalVestedAmount_After_Vesting_2 = BigNumber.sum.apply(null, [redeemAmount_Vesting_1, redeemAmount_Vesting_2]);

      const blocknumberAfter_Vesting_2 = await getBlockNumber(xvsVesting);
      const expectedWithdrawalAmount_Vesting_2 =
        calculatedExpectedWithdrawalAmount(expected_TotalVestedAmount_After_Vesting_2, 0, vestingRecord_After_Vesting_1["vestingStartBlock"], blocknumberAfter_Vesting_2);

      const xvsBalance_Of_Redeemer_After_Vesting_2 = await call(xvsToken, 'balanceOf', [redeemerAddress]);
      expect(new BigNumber(xvsBalance_Of_Redeemer_After_Vesting_2).isEqualTo(expected_TotalVestedAmount_After_Vesting_2));

      expect(depositTxn_Vesting_2).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: expected_TotalVestedAmount_After_Vesting_2,
        vestingStartBlock: vestingStartBlock_Vesting_2,
        "withdrawnAmount": new BigNumber(expectedWithdrawalAmount_Vesting_2)
      });

    });

    it("deposit Zero XVSAmount should Fail with Revert Reason", async () => {
      const redeemAmount = bnbMantissa(0);
      await expect(send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount], { from: vrtConversionAddress }))
        .rejects.toRevert("revert Deposit amount must be non-zero");
    });

  });

  describe("Withdraw XVS After Vesting", () => {

    it("Withdraw XVS - After 1st Vesting With a wait of 360 days", async () => {

      const redeemAmount_Vesting_1 = bnbMantissa(100);
      await setBlockNumber(xvsVesting, 0);

      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemAmount_Vesting_1], { from: root });
      await incrementBlocks(xvsVesting, 1);

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const vestingStartBlock_Vesting_1 = await getBlockNumber(xvsVesting);
      let depositTxn_Vesting_1 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const blocknumberAfter_Vesting_1 = vestingStartBlock_Vesting_1;
      const expectedWithdrawalAmount_Vesting_1 =
        calculatedExpectedWithdrawalAmount(redeemAmount_Vesting_1, 0, vestingStartBlock_Vesting_1, blocknumberAfter_Vesting_1);

      expect(depositTxn_Vesting_1).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: redeemAmount_Vesting_1,
        withdrawnAmount: BigNumber(expectedWithdrawalAmount_Vesting_1),
        vestingStartBlock: vestingStartBlock_Vesting_1
      });

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      // Advance by 360 Days
      await incrementBlocks(xvsVesting, getBlocksbyDays(360));

      const xvs_balance_of_redeemer_before_withdraw = await call(xvsToken, 'balanceOf', [redeemerAddress]);
      const xvs_balance_of_vestingContract_before_withdraw = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);

      let withdrawTxn_After_Vesting_1 = await send(xvsVesting, 'withdraw', [redeemerAddress], { from: redeemerAddress });
      await incrementBlocks(xvsVesting, 1);

      expect(withdrawTxn_After_Vesting_1).toSucceed();

      const xvs_balance_of_redeemer_after_withdraw = await call(xvsToken, 'balanceOf', [redeemerAddress]);
      const xvs_balance_of_vestingContract_after_withdraw = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);

      expect(new BigNumber(xvs_balance_of_redeemer_after_withdraw)).toEqual
        (new BigNumber(xvs_balance_of_redeemer_before_withdraw).plus(new BigNumber(redeemAmount_Vesting_1)));

      expect(new BigNumber(xvs_balance_of_vestingContract_after_withdraw)).toEqual
        (new BigNumber(xvs_balance_of_vestingContract_before_withdraw).minus(new BigNumber(redeemAmount_Vesting_1)));

      expect(withdrawTxn_After_Vesting_1).toHaveLog('XVSWithdrawn', {
        recipient: redeemerAddress,
        amount: new BigNumber(redeemAmount_Vesting_1)
      });
    });

    it("Withdraw XVS - Fails to withdraw with no-balance", async () => {
      await expect(send(xvsVesting, 'withdraw', [redeemerAddress], { from: redeemerAddress }))
        .rejects.toRevert("revert Address doesnot have any vested amount for withdrawal");
    });

    it("Withdraw XVS - Fails due to invalid VRTConversion Address", async () => {
      await send(xvsVesting, 'overWriteVRTConversionAddress');
      await expect(send(xvsVesting, 'withdraw', [redeemerAddress], { from: redeemerAddress }))
        .rejects.toRevert("revert VRT-Conversion Address is not set");
    });

    it("Withdraw XVS - Fails to withdraw with Insufficient XVS in XVSVesting Contractt", async () => {

      const redeemAmount_Vesting_1 = bnbMantissa(100);
      await setBlockNumber(xvsVesting, 0);

      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemAmount_Vesting_1], { from: root });
      await incrementBlocks(xvsVesting, 1);

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const vestingStartBlock_Vesting_1 = await getBlockNumber(xvsVesting);
      let depositTxn_Vesting_1 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      const blocknumberAfter_Vesting_1 = vestingStartBlock_Vesting_1;
      const expectedWithdrawalAmount_Vesting_1 =
        calculatedExpectedWithdrawalAmount(redeemAmount_Vesting_1, 0, vestingStartBlock_Vesting_1, blocknumberAfter_Vesting_1);

      expect(depositTxn_Vesting_1).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: redeemAmount_Vesting_1,
        withdrawnAmount: BigNumber(expectedWithdrawalAmount_Vesting_1),
        vestingStartBlock: vestingStartBlock_Vesting_1
      });

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });
      await incrementBlocks(xvsVesting, 1);

      // Advance by 180 Days
      await incrementBlocks(xvsVesting, getBlocksbyDays(180));

      await send(xvsVesting, 'recoverXVS', [randomAddress]);

      await expect(send(xvsVesting, 'withdraw', [redeemerAddress], { from: redeemerAddress }))
        .rejects.toRevert("revert Insufficient XVS in XVSVesting Contract");
    });

  });

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await call(xvsVesting, 'admin')).toEqual(root);
    });
  });

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero()
    });
  });

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      await expect(send(xvsVesting, '_setPendingAdmin', [accounts[0]], { from: accounts[0] }))
        .rejects.toRevert('revert Only Admin can set the PendingAdmin');

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero();
    });

    it('should properly set pending admin', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should properly set pending admin twice', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toEqual(accounts[1]);
    });

    it('should emit event', async () => {
      const result = await send(xvsVesting, '_setPendingAdmin', [accounts[0]]);
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: address(0),
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      await expect(send(xvsVesting, '_acceptAdmin')).rejects.toRevert('revert Only PendingAdmin can accept as Admin');

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero();
    });

    it('should fail when called by another account (e.g. root)', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      await expect(send(xvsVesting, '_acceptAdmin')).rejects.toRevert('revert Only PendingAdmin can accept as Admin');

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should succeed and set admin and clear pending admin', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(xvsVesting, '_acceptAdmin', [], {from: accounts[0]})).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(accounts[0]);
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero();
    });

    it('should emit log on success', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      const result = await send(xvsVesting, '_acceptAdmin', [], {from: accounts[0]});
      expect(result).toHaveLog('NewAdmin', {
        oldAdmin: root,
        newAdmin: accounts[0],
      });
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: accounts[0],
        newPendingAdmin: address(0),
      });
    });

  });

});