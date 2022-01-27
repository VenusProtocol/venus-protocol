const BigNum = require('bignumber.js');
const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime,
  address
} = require('../Utils/BSC');

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const ONE_DAY = 24 * 60 * 60;
const ONE_YEAR = 360 * 24 * 60 * 60;
const TOTAL_PERIODS = 360;

describe('VRTConverterProxy', () => {
  let root, alice, bob;
  let vrtConversion, vrtConversionAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp, delay = 10;
  let conversionRatio, conversionRatioMultiplier, conversionStartTime, vrtDailyLimit, vrtTotalSupply;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint, xvsTokenMintAmount;
  let xvsVesting, xvsVestingAddress;

  beforeEach(async () => {
    [root, alice, bob, ...accounts] = saddle.accounts;

    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;

    // 12,000 VRT =  1 XVS
    // 1 VRT = 1/12,000 = 0.000083
    conversionRatioMultiplier = 0.000083;

    conversionRatio = new BigNum(0.000083e18);
    vrtTotalSupply = bnbMantissa(30000000000);

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

    let vestingDuration = 365 * 24 * 60 * 60;
    let vestingFrequency = 100;
    xvsVesting = await deploy('XVSVestingHarness', [xvsTokenAddress]);
    xvsVestingAddress = xvsVesting._address;

    //deploy VRTConversion
    vrtConversion = await deploy('VRTConverterHarness', [vrtTokenAddress, xvsTokenAddress, xvsVestingAddress, conversionRatio, conversionStartTime, vrtTotalSupply]);

    vrtConversionAddress = vrtConversion._address;

    await send(xvsVesting, '_setVrtConversion', [vrtConversionAddress], { from: root });

    await send(vrtToken, "approve", [vrtConversionAddress, 0], { from: alice });
    await send(vrtToken, "approve", [vrtConversionAddress, 0], { from: bob });
  });

  describe("constructor", () => {

    it("sets conversionRatio for VRT -> XVS", async () => {
      let conversionRatioQueryResponse = await call(vrtConversion, "conversionRatio");
      expect(parseFloat(conversionRatioQueryResponse)).toEqual(parseFloat(conversionRatio));
    });

    it("sets conversionStartTime for VRT -> XVS", async () => {
      let conversionStartTimeQueryResponse = await call(vrtConversion, "conversionStartTime");
      expect(parseInt(conversionStartTimeQueryResponse)).toEqual(parseInt(conversionStartTime));
    });


    it("sets decimalsMultiplier for VRT", async () => {
      let vrtDecimalsMultiplierQueryResponse = await call(vrtConversion, "vrtDecimalsMultiplier");
      expect(parseInt(vrtDecimalsMultiplierQueryResponse)).toEqual(10 ** 18);
    });

    it("sets decimalsMultiplier for  XVS", async () => {
      let xvsDecimalsMultiplierQueryResponse = await call(vrtConversion, "xvsDecimalsMultiplier");
      expect(parseInt(xvsDecimalsMultiplierQueryResponse)).toEqual(10 ** 18);
    });

  });

  describe("contract balances", () => {

    it("vrtConversion should be funded with XVS", async () => {
      const xvsTokenMintAmount = bnbMantissa(100000);
      await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });

      let xvsTokenBalanceOfVRTConversion = await call(xvsToken, "balanceOf", [vrtConversionAddress]);
      expect(bnbUnsigned(xvsTokenBalanceOfVRTConversion)).toEqual(xvsTokenMintAmount);
    });

    it("Alice should have VRT for conversion", async () => {
      let vrtTokenBalanceOfAlice = await call(vrtToken, "balanceOf", [alice]);
      expect(bnbUnsigned(vrtTokenBalanceOfAlice)).toEqual(vrtFundingAmount);
    });

    it("Bob should have VRT for conversion", async () => {
      let vrtTokenBalanceOfBob = await call(vrtToken, "balanceOf", [bob]);
      expect(bnbUnsigned(vrtTokenBalanceOfBob)).toEqual(vrtFundingAmount);
    });

  });

  describe("DailyLimit And RedeemableAmount Tests", () => {

    it("assert dailyLimit computed", async () => {
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });
      const summer = new BigNum(vrtTotalSupply).plus(new BigNum(360)).toFixed(0);
      let expectedDailyLimit = new BigNum(vrtTotalSupply).dividedToIntegerBy(new BigNum(360)).toFixed(0);
      expect(new BigNum(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });

    it("assert dailyLimit computed With TimeTravel of 1 Hour", async () => {
      delay = 1 * 60 * 60;
      const currentTimeForFreeze = blockTimestamp.add(delay);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });

      // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
      let numberOfPeriodsPassed = (new BigNum(currentTimeForFreeze).minus(blockTimestamp)).dividedToIntegerBy(ONE_DAY);

      // remainingPeriods = totalPeriods - numberOfPeriodsPassed
      let remainingPeriods = new BigNum(TOTAL_PERIODS).minus(numberOfPeriodsPassed);
      expect(remainingPeriods).toEqual(new BigNum(TOTAL_PERIODS));
      let expectedDailyLimit = new BigNum(vrtTotalSupply).dividedToIntegerBy(new BigNum(remainingPeriods));
      expectedDailyLimit = new BigNum(expectedDailyLimit).toFixed(0);

      expect(new BigNum(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });


    it("assert dailyLimit computed With TimeTravel of 23 Hours 59 Minutes", async () => {
      delay = 23 * 60 * 60 + 59 * 60;
      const currentTimeForFreeze = blockTimestamp.add(delay);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });

      // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
      let numberOfPeriodsPassed = (new BigNum(currentTimeForFreeze).minus(blockTimestamp)).dividedToIntegerBy(ONE_DAY);

      // remainingPeriods = totalPeriods - numberOfPeriodsPassed
      let remainingPeriods = new BigNum(TOTAL_PERIODS).minus(numberOfPeriodsPassed);
      expect(remainingPeriods).toEqual(new BigNum(TOTAL_PERIODS));

      let expectedDailyLimit = new BigNum(vrtTotalSupply).dividedToIntegerBy(new BigNum(remainingPeriods));
      expectedDailyLimit = new BigNum(expectedDailyLimit).toFixed(0);

      expect(new BigNum(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });

    it("assert dailyLimit computed With TimeTravel of 1 Day", async () => {
      delay = 24 * 60 * 60;
      const currentTimeForFreeze = blockTimestamp.add(delay);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });

      // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
      let numberOfPeriodsPassed = (new BigNum(currentTimeForFreeze).minus(blockTimestamp)).dividedToIntegerBy(ONE_DAY);

      // remainingPeriods = totalPeriods - numberOfPeriodsPassed
      let remainingPeriods = new BigNum(TOTAL_PERIODS).minus(numberOfPeriodsPassed);
      let expectedDailyLimit = new BigNum(vrtTotalSupply).dividedToIntegerBy(new BigNum(remainingPeriods));
      expectedDailyLimit = new BigNum(expectedDailyLimit).toFixed(0);

      expect(new BigNum(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });

    it("assert dailyLimit computed With TimeTravel of 360 Days", async () => {
      const currentTimeForFreeze = blockTimestamp.add(ONE_YEAR);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });
      expect(new BigNum(vrtDailyLimitFromContract)).toEqual(new BigNum(0));
    });

    it("assert redeemableAmount computed With TimeTravel of 1 Day to 1Day-1Hour to 2 Days", async () => {

      let currentTimeForFreeze = blockTimestamp.add(24 * 60 * 60);
      await freezeTime(currentTimeForFreeze.toNumber());
      let redeemableAmountResponse_After_1Day = await call(vrtConversion, "computeRedeemableAmountAndDailyUtilisation", { from: root });
      const redeemAmount_After_1Day = redeemableAmountResponse_After_1Day["redeemableAmount"];

      currentTimeForFreeze = currentTimeForFreeze.add(60 * 60);
      await freezeTime(currentTimeForFreeze.toNumber());
      let redeemableAmountResponse_After_1Day1Hr = await call(vrtConversion, "computeRedeemableAmountAndDailyUtilisation", { from: root });
      const redeemAmount_After_1Day1Hr = redeemableAmountResponse_After_1Day1Hr["redeemableAmount"];

      expect(new BigNum(redeemAmount_After_1Day1Hr)).toEqual(new BigNum(redeemAmount_After_1Day));

      currentTimeForFreeze = currentTimeForFreeze.add(23 * 60 * 60);
      await freezeTime(currentTimeForFreeze.toNumber());
      let redeemableAmountResponse_After_2Days = await call(vrtConversion, "computeRedeemableAmountAndDailyUtilisation", { from: root });
      const redeemAmount_After_2Days = redeemableAmountResponse_After_2Days["redeemableAmount"];
      expect(new BigNum(redeemAmount_After_2Days).isGreaterThan(redeemAmount_After_1Day)).toBe(true);

    });


    it("assert redeemableAmount computed With TimeTravel and Varying dailyUtilisation", async () => {

      let currentTimeForFreeze = blockTimestamp.add(24 * 60 * 60);
      await freezeTime(currentTimeForFreeze.toNumber());
      let redeemableAmountResponse_After_1Day = await call(vrtConversion, "computeRedeemableAmountAndDailyUtilisation", { from: root });
      const redeemAmount_After_1Day = redeemableAmountResponse_After_1Day["redeemableAmount"];
      const dailyUtilisation_After_1Day = redeemableAmountResponse_After_1Day["dailyUtilisation"];
      expect(new BigNum(dailyUtilisation_After_1Day)).toEqual(new BigNum(0));
      const vrtDailyLimit_After_1Day = redeemableAmountResponse_After_1Day["vrtDailyLimit"];
      expect(new BigNum(redeemAmount_After_1Day)).toEqual(new BigNum(vrtDailyLimit_After_1Day));
      const numberOfDaysSinceStart_After_1Day = redeemableAmountResponse_After_1Day["numberOfDaysSinceStart"];
      expect(new BigNum(numberOfDaysSinceStart_After_1Day)).toEqual(new BigNum(1));

      vrtTransferAmount = bnbMantissa(10000);

      const redeemableXVSAmountFromHarness = await call(vrtConversion, 'getXVSRedeemedAmount', [vrtTransferAmount]);
      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemableXVSAmountFromHarness], { from: root });
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });
      expect(convertVRTTxn).toSucceed();

      currentTimeForFreeze = currentTimeForFreeze.add(60 * 60);
      await freezeTime(currentTimeForFreeze.toNumber());
      let redeemableAmountResponse_After_1Day1Hr = await call(vrtConversion, "computeRedeemableAmountAndDailyUtilisation", { from: root });
      const numberOfDaysSinceStart_After_1Day1Hr = redeemableAmountResponse_After_1Day1Hr["numberOfDaysSinceStart"];
      expect(new BigNum(numberOfDaysSinceStart_After_1Day1Hr)).toEqual(new BigNum(1));

      const dailyUtilisation_After_1Day1Hr = redeemableAmountResponse_After_1Day1Hr["dailyUtilisation"];
      const vrtDailyLimit_After_1Day1Hr = redeemableAmountResponse_After_1Day1Hr["vrtDailyLimit"];
      const expectedReedemAmount_After_1Day1Hr = new BigNum(vrtDailyLimit_After_1Day1Hr).minus(new BigNum(dailyUtilisation_After_1Day1Hr));
      const redeemAmount_After_1Day1Hr = redeemableAmountResponse_After_1Day1Hr["redeemableAmount"];
      expect(new BigNum(redeemAmount_After_1Day1Hr)).toEqual(new BigNum(expectedReedemAmount_After_1Day1Hr));
      expect(new BigNum(redeemAmount_After_1Day1Hr).isLessThan(new BigNum(redeemAmount_After_1Day))).toBe(true);
      expect(new BigNum(dailyUtilisation_After_1Day1Hr)).toEqual(new BigNum(vrtTransferAmount));
    });

  });

  describe("convert VRT to XVS", () => {

    it("alice cannot convert her VRT to XVS - as VRTAmount is invalid", async () => {
      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      await expect(send(vrtConversion, "convert", [0], { from: alice }))
        .rejects.toRevert('revert VRT amount must be non-zero');
    });

    it("alice cannot convert her VRT to XVS as conversionContract doesnot have sufficient XVS-Amount", async () => {
      vrtTransferAmount = bnbMantissa(20000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(delay).add(1);
      await freezeTime(newBlockTimestamp.toNumber());
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice }))
        .rejects.toRevert('revert not enough XVSTokens');
    });

    it("alice can convert her VRT to XVS", async () => {
      vrtTransferAmount = bnbMantissa(10000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(ONE_DAY);
      await freezeTime(newBlockTimestamp.toNumber());

      let xvsVestedAmount = new BigNum(vrtTransferAmount).multipliedBy(new BigNum(conversionRatioMultiplier));

      const redeemableXVSAmountFromHarness = await call(vrtConversion, 'getXVSRedeemedAmount', [vrtTransferAmount]);
      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemableXVSAmountFromHarness], { from: root });

      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });
      expect(convertVRTTxn).toSucceed();

      let vrtTokensInConversion = await call(vrtToken, "balanceOf", [vrtConversionAddress]);
      expect(new BigNum(vrtTokensInConversion)).toEqual(new BigNum(0));

      let vrtTokensInBurnAddress = await call(vrtToken, "balanceOf", [BURN_ADDRESS]);
      expect(new BigNum(vrtTokensInBurnAddress)).toEqual(new BigNum(vrtTransferAmount));

      expect(convertVRTTxn).toHaveLog('TokenConverted', {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        xvsAddress: xvsTokenAddress,
        vrtAmount: vrtTransferAmount.toFixed(),
        xvsAmount: xvsVestedAmount.toFixed()
      });

    });
  });

  describe("convert VRT to XVS - TimeRange tests For Failed Conversions", () => {

    it("alice cannot convert her VRT to XVS as Conversion has-not started yet", async () => {

      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });

      delay = 10;
      const newBlockTimestamp = blockTimestamp.sub(delay);
      await freezeTime(newBlockTimestamp.toNumber());

      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice }))
        .rejects.toRevert('revert VRT conversion didnot start yet');
    });

    it("alice cannot convert her VRT to XVS as Conversion period ended", async () => {

      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const conversionEndTime = await call(vrtConversion, "conversionEndTime", { from: root });
      const newConversionEndTimeWithDelay = bnbUnsigned(conversionEndTime).add(delay);
      await freezeTime(newConversionEndTimeWithDelay.toNumber());
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice }))
        .rejects.toRevert('revert VRT conversion period ended');
    });
  });


  describe("Withdraw funds from VRTConversion", () => {

    it("Admin can withdraw XVS from VRTConversion", async () => {

      const xvsTokenMintAmount = bnbMantissa(100000);
      await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });
      const xvsBalanceOfRoot_BeforeWithdrawal = await call(xvsToken, "balanceOf", [root]);

      const xvsTokenWithdrawAmount = bnbMantissa(50000);
      const withdrawXVSTxn = await send(vrtConversion, "withdraw", [xvsTokenAddress, xvsTokenWithdrawAmount, root], { from: root });
      expect(withdrawXVSTxn).toSucceed();

      //Assert WithdrawalEvent
      expect(withdrawXVSTxn).toHaveLog('TokenWithdraw', {
        token: xvsTokenAddress,
        to: root,
        amount: xvsTokenWithdrawAmount.toFixed()
      });

      //Assert XVS-Balance of VRTConversion (Before and After Withdrawal)
      const expected_XVS_Balanace_Of_VRTConversion_AfterWithdrawal =
        (xvsTokenMintAmount).sub(xvsTokenWithdrawAmount);
      const xvsBalanceOfVRTConversion_AfterWithdrawal = await call(xvsToken, "balanceOf", [vrtConversionAddress]);
      expect(bnbUnsigned(xvsBalanceOfVRTConversion_AfterWithdrawal)).toEqual(expected_XVS_Balanace_Of_VRTConversion_AfterWithdrawal);

      //Assert XVS-Balance of Root (Before and After Withdrawal)
      const xvsBalanceOfRoot_AfterWithdrawal = await call(xvsToken, "balanceOf", [root]);
      const expected_XVSBalanceOfRoot_AfterWithdrawal = (bnbUnsigned(xvsBalanceOfRoot_BeforeWithdrawal))
        .add(xvsTokenWithdrawAmount);

      expect(bnbUnsigned(xvsBalanceOfRoot_AfterWithdrawal)).toEqual(expected_XVSBalanceOfRoot_AfterWithdrawal);
    });


    it("Admin can withdrawAll XVS from VRTConversion", async () => {

      const xvsTokenMintAmount = bnbMantissa(100000);
      await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });
      const xvsBalanceOfRoot_BeforeWithdrawal = await call(xvsToken, "balanceOf", [root]);

      const xvsTokenWithdrawAmount = xvsTokenMintAmount;

      const withdrawXVSTxn = await send(vrtConversion, "withdrawAll", [xvsTokenAddress, root], { from: root });
      expect(withdrawXVSTxn).toSucceed();

      //Assert WithdrawalEvent
      expect(withdrawXVSTxn).toHaveLog('TokenWithdraw', {
        token: xvsTokenAddress,
        to: root,
        amount: xvsTokenWithdrawAmount.toFixed()
      });

      //Assert XVS-Balance of VRTConversion (Before and After Withdrawal)
      const expected_XVS_Balanace_Of_VRTConversion_AfterWithdrawal =
        (xvsTokenMintAmount).sub(xvsTokenWithdrawAmount);
      const xvsBalanceOfVRTConversion_AfterWithdrawal = await call(xvsToken, "balanceOf", [vrtConversionAddress]);
      expect(bnbUnsigned(xvsBalanceOfVRTConversion_AfterWithdrawal)).toEqual(expected_XVS_Balanace_Of_VRTConversion_AfterWithdrawal);

      //Assert XVS-Balance of Root (Before and After Withdrawal)
      const xvsBalanceOfRoot_AfterWithdrawal = await call(xvsToken, "balanceOf", [root]);
      const expected_XVSBalanceOfRoot_AfterWithdrawal = (bnbUnsigned(xvsBalanceOfRoot_BeforeWithdrawal))
        .add(xvsTokenWithdrawAmount);

      expect(bnbUnsigned(xvsBalanceOfRoot_AfterWithdrawal)).toEqual(expected_XVSBalanceOfRoot_AfterWithdrawal);
    });

    it("Admin call withdrawAll with Zero-XVS in VRTConversion", async () => {

      const xvsBalanceOfRoot_BeforeWithdrawal = await call(xvsToken, "balanceOf", [root]);
      const xvsBalanceOf_VRTConverter_BeforeWithdrawal = await call(xvsToken, "balanceOf", [vrtConversionAddress]);

      const withdrawXVSTxn = await send(vrtConversion, "withdrawAll", [xvsTokenAddress, root], { from: root });
      expect(withdrawXVSTxn).toSucceed();

      //Assert XVS-Balance of VRTConversion (Before and After Withdrawal)
      const expected_XVS_Balanace_Of_VRTConversion_AfterWithdrawal = xvsBalanceOf_VRTConverter_BeforeWithdrawal;
      const xvsBalanceOfVRTConversion_AfterWithdrawal = await call(xvsToken, "balanceOf", [vrtConversionAddress]);
      expect(xvsBalanceOfVRTConversion_AfterWithdrawal).toEqual(expected_XVS_Balanace_Of_VRTConversion_AfterWithdrawal);

      //Assert XVS-Balance of Root (Before and After Withdrawal)
      const xvsBalanceOfRoot_AfterWithdrawal = await call(xvsToken, "balanceOf", [root]);
      const expected_XVSBalanceOfRoot_AfterWithdrawal = xvsBalanceOfRoot_BeforeWithdrawal;
      expect(xvsBalanceOfRoot_AfterWithdrawal).toEqual(expected_XVSBalanceOfRoot_AfterWithdrawal);
    });

    it("Admin fails to withdraw XVS from VRTConversion", async () => {
      const xvsTokenMintAmount = bnbMantissa(100000);
      await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });

      const xvsAmountForWithdrawal = bnbMantissa(100001);
      await expect(send(vrtConversion, "withdraw", [xvsTokenAddress, xvsAmountForWithdrawal, root], { from: root }))
        .rejects.toRevert("revert Insufficient funds to withdraw");
    });
  });

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await call(vrtConversion, 'admin')).toEqual(root);
    });
  });

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await call(vrtConversion, 'pendingAdmin')).toBeAddressZero()
    });
  });

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      await expect(send(vrtConversion, '_setPendingAdmin', [accounts[0]], { from: accounts[0] }))
        .rejects.toRevert('revert Only Admin can set the PendingAdmin');

      // Check admin stays the same
      expect(await call(vrtConversion, 'admin')).toEqual(root);
      expect(await call(vrtConversion, 'pendingAdmin')).toBeAddressZero();
    });

    it('should properly set pending admin', async () => {
      expect(await send(vrtConversion, '_setPendingAdmin', [accounts[0]])).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConversion, 'admin')).toEqual(root);
      expect(await call(vrtConversion, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should properly set pending admin twice', async () => {
      expect(await send(vrtConversion, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(vrtConversion, '_setPendingAdmin', [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConversion, 'admin')).toEqual(root);
      expect(await call(vrtConversion, 'pendingAdmin')).toEqual(accounts[1]);
    });

    it('should emit event', async () => {
      const result = await send(vrtConversion, '_setPendingAdmin', [accounts[0]]);
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: address(0),
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      await expect(send(vrtConversion, '_acceptAdmin')).rejects.toRevert('revert Only PendingAdmin can accept as Admin');

      // Check admin stays the same
      expect(await call(vrtConversion, 'admin')).toEqual(root);
      expect(await call(vrtConversion, 'pendingAdmin')).toBeAddressZero();
    });

    it('should fail when called by another account (e.g. root)', async () => {
      expect(await send(vrtConversion, '_setPendingAdmin', [accounts[0]])).toSucceed();
      await expect(send(vrtConversion, '_acceptAdmin')).rejects.toRevert('revert Only PendingAdmin can accept as Admin');

      // Check admin stays the same
      expect(await call(vrtConversion, 'admin')).toEqual(root);
      expect(await call(vrtConversion, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should succeed and set admin and clear pending admin', async () => {
      expect(await send(vrtConversion, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(vrtConversion, '_acceptAdmin', [], { from: accounts[0] })).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConversion, 'admin')).toEqual(accounts[0]);
      expect(await call(vrtConversion, 'pendingAdmin')).toBeAddressZero();
    });

    it('should emit log on success', async () => {
      expect(await send(vrtConversion, '_setPendingAdmin', [accounts[0]])).toSucceed();
      const result = await send(vrtConversion, '_acceptAdmin', [], { from: accounts[0] });
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
