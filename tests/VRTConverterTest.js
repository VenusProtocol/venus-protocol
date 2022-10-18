const BigNum = require("bignumber.js");
const { bnbUnsigned, bnbMantissa, freezeTime } = require("./Utils/BSC");

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_DAY = 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const TOTAL_PERIODS = 365;

describe("VRTConverterProxy", () => {
  let root, alice, bob;
  let vrtConversion, vrtConversionAddress, vrtToken, vrtTokenAddress, xvsToken, xvsTokenAddress;
  let blockTimestamp;
  let conversionRatio, conversionRatioMultiplier, conversionStartTime, conversionPeriod;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint;
  let xvsVesting, xvsVestingAddress;
  let accounts = [];

  beforeEach(async () => {
    [root, alice, bob, ...accounts] = saddle.accounts;

    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;
    conversionPeriod = 365 * 24 * 60 * 60;

    // 12,000 VRT =  1 XVS
    // 1 VRT = 1/12,000 = 0.000083
    conversionRatioMultiplier = 0.000083;

    conversionRatio = new BigNum(0.000083e18);

    //deploy VRT
    vrtToken = await deploy("VRT", [root]);

    vrtTokenAddress = vrtToken._address;
    vrtForMint = bnbMantissa(200000);
    await send(vrtToken, "transfer", [root, vrtForMint], { from: root });

    vrtFundingAmount = bnbMantissa(100000);

    // Transfer BEP20 to alice
    await send(vrtToken, "transfer", [alice, vrtFundingAmount], { from: root });

    // Transfer BEP20 to bob
    await send(vrtToken, "transfer", [bob, vrtFundingAmount], { from: root });

    //deploy XVS
    xvsToken = await deploy("XVS", [root]);
    xvsTokenAddress = xvsToken._address;

    xvsVesting = await deploy("XVSVestingHarness");
    xvsVestingAddress = xvsVesting._address;

    //deploy VRTConversion
    vrtConversion = await deploy("VRTConverterHarness");
    vrtConversionAddress = vrtConversion._address;
    await send(vrtConversion, "initialize", [
      vrtTokenAddress,
      xvsTokenAddress,
      conversionRatio,
      conversionStartTime,
      conversionPeriod,
    ]);
    await send(xvsVesting, "initialize", [xvsTokenAddress]);
    await send(vrtConversion, "setXVSVesting", [xvsVestingAddress]);
    await send(xvsVesting, "setVRTConverter", [vrtConversionAddress]);

    await send(vrtToken, "approve", [vrtConversionAddress, 0], { from: alice });
    await send(vrtToken, "approve", [vrtConversionAddress, 0], { from: bob });
  });

  describe("constructor", () => {
    it("sets conversionRatio for VRT -> XVS", async () => {
      let conversionRatioQueryResponse = await call(vrtConversion, "conversionRatio");
      expect(parseFloat(conversionRatioQueryResponse)).toEqual(parseFloat(conversionRatio));
    });

    it("sets decimalsMultiplier for VRT", async () => {
      let vrtDecimalsMultiplierQueryResponse = await call(vrtConversion, "vrtDecimalsMultiplier");
      expect(parseInt(vrtDecimalsMultiplierQueryResponse)).toEqual(10 ** 18);
    });

    it("sets decimalsMultiplier for  XVS", async () => {
      let xvsDecimalsMultiplierQueryResponse = await call(vrtConversion, "xvsDecimalsMultiplier");
      expect(parseInt(xvsDecimalsMultiplierQueryResponse)).toEqual(10 ** 18);
    });

    it("sets initialized to true in vrtConversion", async () => {
      let initializedActual = await call(vrtConversion, "initialized");
      expect(initializedActual).toEqual(true);
    });
  });

  describe("initialize", () => {
    it("Fail on initialisation by non-Admin", async () => {
      await expect(
        send(
          vrtConversion,
          "initialize",
          [vrtTokenAddress, xvsTokenAddress, conversionRatio, conversionStartTime, conversionPeriod],
          { from: accounts[1] },
        ),
      ).rejects.toRevert("revert only admin may initialize the VRTConverter");
    });

    it("Fail on duplicate initialisation", async () => {
      await expect(
        send(vrtConversion, "initialize", [
          vrtTokenAddress,
          xvsTokenAddress,
          conversionRatio,
          conversionStartTime,
          conversionPeriod,
        ]),
      ).rejects.toRevert("revert VRTConverter is already initialized");
    });
  });

  describe("contract balances", () => {
    it("vrtConversion should be funded with XVS", async () => {
      const xvsTokenMintAmount = bnbMantissa(100000);
      await send(xvsToken, "transfer", [vrtConversionAddress, xvsTokenMintAmount], { from: root });

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

  describe("convert VRT to XVS", () => {
    let vrtTransferAmount_Conversion_1;
    it("alice can convert her VRT", async () => {
      vrtTransferAmount = bnbMantissa(10000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(ONE_DAY);
      await freezeTime(newBlockTimestamp.toNumber());

      const redeemableXVSAmountFromHarness = await call(vrtConversion, "getXVSRedeemedAmount", [vrtTransferAmount]);
      let xvsVestedAmount = new BigNum(vrtTransferAmount).multipliedBy(new BigNum(conversionRatioMultiplier));
      expect(new BigNum(redeemableXVSAmountFromHarness)).toEqual(xvsVestedAmount);

      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });
      expect(convertVRTTxn).toSucceed();

      let vrtTokensInConversion = await call(vrtToken, "balanceOf", [vrtConversionAddress]);
      expect(new BigNum(vrtTokensInConversion)).toEqual(new BigNum(0));

      let vrtTokensInBurnAddress = await call(vrtToken, "balanceOf", [BURN_ADDRESS]);
      expect(new BigNum(vrtTokensInBurnAddress)).toEqual(new BigNum(vrtTransferAmount));

      expect(convertVRTTxn).toHaveLog("TokenConverted", {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        vrtAmount: vrtTransferAmount.toFixed(),
        xvsAddress: xvsTokenAddress,
        xvsAmount: xvsVestedAmount.toFixed(),
      });

      let totalConvertedAmount = await call(vrtConversion, "totalVrtConverted", []);
      expect(new BigNum(totalConvertedAmount)).toEqual(new BigNum(vrtTransferAmount));
    });

    it("alice can make multiple VRT conversions", async () => {
      vrtTransferAmount_Conversion_1 = bnbMantissa(10000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount_Conversion_1], { from: alice });
      let newBlockTimestamp = blockTimestamp.add(ONE_DAY);
      await freezeTime(newBlockTimestamp.toNumber());

      const redeemableXVSAmountFromHarness_Conversion_1 = await call(vrtConversion, "getXVSRedeemedAmount", [
        vrtTransferAmount_Conversion_1,
      ]);
      let xvsVestedAmount_Conversion_1 = new BigNum(vrtTransferAmount_Conversion_1).multipliedBy(
        new BigNum(conversionRatioMultiplier),
      );
      expect(new BigNum(redeemableXVSAmountFromHarness_Conversion_1)).toEqual(xvsVestedAmount_Conversion_1);

      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount_Conversion_1], { from: alice });
      expect(convertVRTTxn).toSucceed();

      let vrtTokensInConversion = await call(vrtToken, "balanceOf", [vrtConversionAddress]);
      expect(new BigNum(vrtTokensInConversion)).toEqual(new BigNum(0));

      let vrtTokensInBurnAddress = await call(vrtToken, "balanceOf", [BURN_ADDRESS]);
      expect(new BigNum(vrtTokensInBurnAddress)).toEqual(new BigNum(vrtTransferAmount_Conversion_1));

      expect(convertVRTTxn).toHaveLog("TokenConverted", {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        vrtAmount: vrtTransferAmount_Conversion_1.toFixed(),
        xvsAddress: xvsTokenAddress,
        xvsAmount: xvsVestedAmount_Conversion_1.toFixed(),
      });

      let totalConvertedAmount = await call(vrtConversion, "totalVrtConverted", []);
      expect(new BigNum(totalConvertedAmount)).toEqual(new BigNum(vrtTransferAmount_Conversion_1));

      //2nd Conversion
      const vrtTransferAmount_Conversion_2 = bnbMantissa(20000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount_Conversion_2], { from: alice });
      newBlockTimestamp = blockTimestamp.add(ONE_DAY);
      await freezeTime(newBlockTimestamp.toNumber());

      const redeemableXVSAmountFromHarness_Conversion_2 = await call(vrtConversion, "getXVSRedeemedAmount", [
        vrtTransferAmount_Conversion_2,
      ]);
      let xvsVestedAmount_Conversion_2 = new BigNum(vrtTransferAmount_Conversion_2).multipliedBy(
        new BigNum(conversionRatioMultiplier),
      );
      expect(new BigNum(redeemableXVSAmountFromHarness_Conversion_2)).toEqual(xvsVestedAmount_Conversion_2);

      const convertVRTTxn_2 = await send(vrtConversion, "convert", [vrtTransferAmount_Conversion_2], { from: alice });
      expect(convertVRTTxn_2).toSucceed();

      vrtTokensInConversion = await call(vrtToken, "balanceOf", [vrtConversionAddress]);
      expect(new BigNum(vrtTokensInConversion)).toEqual(new BigNum(0));

      vrtTokensInBurnAddress = await call(vrtToken, "balanceOf", [BURN_ADDRESS]);
      expect(new BigNum(vrtTokensInBurnAddress)).toEqual(
        new BigNum(vrtTransferAmount_Conversion_1).plus(new BigNum(vrtTransferAmount_Conversion_2)),
      );

      expect(convertVRTTxn_2).toHaveLog("TokenConverted", {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        vrtAmount: vrtTransferAmount_Conversion_2.toFixed(),
        xvsAddress: xvsTokenAddress,
        xvsAmount: xvsVestedAmount_Conversion_2.toFixed(),
      });

      //assert totalConvertedAmount after 2nd Conversion
      totalConvertedAmount = await call(vrtConversion, "totalVrtConverted", []);
      expect(new BigNum(totalConvertedAmount)).toEqual(
        new BigNum(vrtTransferAmount_Conversion_1).plus(new BigNum(vrtTransferAmount_Conversion_2)),
      );
    });
  });

  describe("Cannot convert VRT to XVS - Failure Scenarios", () => {
    it("VRTAmount is invalid", async () => {
      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      await expect(send(vrtConversion, "convert", [0], { from: alice })).rejects.toRevert(
        "revert VRT amount must be non-zero",
      );
    });

    it("conversion has not started yet", async () => {
      //override conversionStartTime and set it to 1 Day later in future
      const newConversionStartTime = blockTimestamp.add(ONE_DAY);
      await send(vrtConversion, "setConversionTimeline", [newConversionStartTime, conversionPeriod], { from: root });

      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice })).rejects.toRevert(
        "revert Conversion did not start yet",
      );
    });

    it("conversion Ended", async () => {
      //push time to 1 Year in to the future
      const newBlockTimestamp = blockTimestamp.add(ONE_YEAR + 1);
      await freezeTime(newBlockTimestamp.toNumber());

      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice })).rejects.toRevert(
        "revert Conversion Period Ended",
      );
    });

    it("Insufficient VRT allowance", async () => {
      vrtTransferAmount = bnbMantissa(100);
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice })).rejects.toRevert(
        "revert SafeBEP20: low-level call failed",
      );
    });
  });
});
