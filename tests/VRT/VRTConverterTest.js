const BigNumber = require('bignumber.js');
const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime
} = require('../Utils/BSC');

const { makeToken } = require('../Utils/Venus');

const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";
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
    conversionRatioMultiplier = 0.75;
    conversionRatio = new BigNumber(0.75e18);
    vrtTotalSupply = bnbMantissa(2000000000);

    //deploy VRT
    // Create New Bep20 Token
    vrtToken = await makeToken();
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
    xvsVesting = await deploy('XVSVesting', [xvsTokenAddress]);
    xvsVestingAddress = xvsVesting._address;

    //deploy VRTConversion
    vrtConversion = await deploy('VRTConverter', [vrtTokenAddress, xvsTokenAddress, xvsVestingAddress, conversionRatio, conversionStartTime, vrtTotalSupply]);

    vrtConversionAddress = vrtConversion._address;
    xvsTokenMintAmount = bnbMantissa(100000);
    await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });

    await send(xvsVesting, '_setVrtConversion', [vrtConversionAddress], { from: root });
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

  describe("DailyLimit Tests", () => {

    it("assert dailyLimit computed", async () => {
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });
      let expectedDailyLimit = new BigNumber(vrtTotalSupply).dividedToIntegerBy(new BigNumber(360));
      expectedDailyLimit = new BigNumber(expectedDailyLimit).toFixed(0);
      expect(new BigNumber(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });

    it("assert dailyLimit computed With TimeTravel of 1 Hour", async () => {
      delay = 1 * 60 * 60;
      const currentTimeForFreeze = blockTimestamp.add(delay);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });

      // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
      let numberOfPeriodsPassed = (new BigNumber(currentTimeForFreeze).minus(blockTimestamp)).dividedToIntegerBy(ONE_DAY);

      // remainingPeriods = totalPeriods - numberOfPeriodsPassed
      let remainingPeriods = new BigNumber(TOTAL_PERIODS).minus(numberOfPeriodsPassed);
      expect(remainingPeriods).toEqual(new BigNumber(TOTAL_PERIODS));
      let expectedDailyLimit = new BigNumber(vrtTotalSupply).dividedToIntegerBy(new BigNumber(remainingPeriods));
      expectedDailyLimit = new BigNumber(expectedDailyLimit).toFixed(0);

      expect(new BigNumber(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });


    it("assert dailyLimit computed With TimeTravel of 23 Hours 59 Minutes", async () => {
      delay = 23 * 60 * 60 + 59 * 60;
      const currentTimeForFreeze = blockTimestamp.add(delay);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });

      // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
      let numberOfPeriodsPassed = (new BigNumber(currentTimeForFreeze).minus(blockTimestamp)).dividedToIntegerBy(ONE_DAY);

      // remainingPeriods = totalPeriods - numberOfPeriodsPassed
      let remainingPeriods = new BigNumber(TOTAL_PERIODS).minus(numberOfPeriodsPassed);
      expect(remainingPeriods).toEqual(new BigNumber(TOTAL_PERIODS));

      let expectedDailyLimit = new BigNumber(vrtTotalSupply).dividedToIntegerBy(new BigNumber(remainingPeriods));
      expectedDailyLimit = new BigNumber(expectedDailyLimit).toFixed(0);

      expect(new BigNumber(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });

    it("assert dailyLimit computed With TimeTravel of 1 Day", async () => {
      delay = 24 * 60 * 60;
      const currentTimeForFreeze = blockTimestamp.add(delay);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });

      // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
      let numberOfPeriodsPassed = (new BigNumber(currentTimeForFreeze).minus(blockTimestamp)).dividedToIntegerBy(ONE_DAY);

      // remainingPeriods = totalPeriods - numberOfPeriodsPassed
      let remainingPeriods = new BigNumber(TOTAL_PERIODS).minus(numberOfPeriodsPassed);
      let expectedDailyLimit = new BigNumber(vrtTotalSupply).dividedToIntegerBy(new BigNumber(remainingPeriods));
      expectedDailyLimit = new BigNumber(expectedDailyLimit).toFixed(0);

      expect(new BigNumber(vrtDailyLimitFromContract).toFixed(0)).toEqual(expectedDailyLimit);
    });

    it("assert dailyLimit computed With TimeTravel of 360 Days", async () => {
      const currentTimeForFreeze = blockTimestamp.add(ONE_YEAR);
      await freezeTime(currentTimeForFreeze.toNumber());
      const vrtDailyLimitFromContract = await call(vrtConversion, "computeVrtDailyLimit", { from: root });
      expect(new BigNumber(vrtDailyLimitFromContract)).toEqual(new BigNumber(0));
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
      vrtTransferAmount = bnbMantissa(2000005);
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

      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });

      let vrtTokensInConversion = await call(vrtToken, "balanceOf", [vrtConversionAddress]);
      expect(new BigNumber(vrtTokensInConversion)).toEqual(new BigNumber(0));

      let vrtTokensInBurnAddress = await call(vrtToken, "balanceOf", [BURN_ADDRESS]);
      expect(new BigNumber(vrtTokensInBurnAddress)).toEqual(new BigNumber(vrtTransferAmount));

      let xvsVestedAmount = new BigNumber(vrtTransferAmount).multipliedBy(new BigNumber(conversionRatioMultiplier));

      expect(convertVRTTxn).toHaveLog('TokenConverted', {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        xvsAddress: xvsTokenAddress,
        vrtAmount: vrtTransferAmount,
        xvsAmount: xvsVestedAmount.toFixed(0)
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

      const xvsBalanceOfRoot_BeforeWithdrawal = await call(xvsToken, "balanceOf", [root]);
      const xvsBalanceOfVRTConversion_BeforeWithdrawal = await call(xvsToken, "balanceOf", [vrtConversionAddress]);

      const withdrawXVSTxn = await send(vrtConversion, "withdraw", [xvsTokenAddress, xvsTokenMintAmount, root], { from: root });

      const xvsBalanceOfRoot_AfterWithdrawal = await call(xvsToken, "balanceOf", [root]);
      const xvsBalanceOfVRTConversion_AfterWithdrawal = await call(xvsToken, "balanceOf", [vrtConversionAddress]);

      expect(bnbUnsigned(xvsBalanceOfVRTConversion_AfterWithdrawal)).toEqual(bnbUnsigned(0));
      const expected_XVSBalanceOfRoot_AfterWithdrawal = (bnbUnsigned(xvsBalanceOfRoot_BeforeWithdrawal))
        .add(bnbUnsigned(xvsBalanceOfVRTConversion_BeforeWithdrawal));

      expect(bnbUnsigned(xvsBalanceOfRoot_AfterWithdrawal)).toEqual(bnbUnsigned(expected_XVSBalanceOfRoot_AfterWithdrawal));

      expect(withdrawXVSTxn).toHaveLog('TokenWithdraw', {
        token: xvsTokenAddress,
        to: root,
        amount: xvsTokenMintAmount
      });
    });

  });

});
