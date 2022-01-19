const BigNumber = require('bignumber.js');

const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime
} = require('../Utils/BSC');

const { makeToken } = require('../Utils/Venus');

const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

describe('XVSVesting', () => {
  let root, alice, bob;
  let vrtConversion, vrtConversionAddress,
    xvsVesting, xvsVestingAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp, delay = 10;
  let conversionRatio, conversionStartTime, vrtDailyLimit;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint, xvsTokenMintAmount;

  beforeEach(async () => {
    [root, alice, bob, ...accounts] = saddle.accounts;

    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;
    conversionRatio = new BigNumber(0.75e18);
    vrtDailyLimit = bnbMantissa(2000000000);

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

    //deploy VRTConversion
    vrtConversion = await deploy('VRTConversion', [vrtTokenAddress, xvsTokenAddress, conversionRatio, conversionStartTime, vrtDailyLimit]);

    vrtConversionAddress = vrtConversion._address;
    xvsTokenMintAmount = bnbMantissa(100000);
    await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });

    let vestingDuration = 365 * 24 * 60 * 60;
    let vestingFrequency = 100;

    xvsVesting = await deploy('XVSVesting', [xvsTokenAddress, vrtConversionAddress, vestingDuration, vestingFrequency]);
    xvsVestingAddress = xvsVesting._address;
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

  describe("convert VRT to XVS", () => {

    it("alice can convert her VRT to XVS", async () => {
      vrtTransferAmount = bnbMantissa(10000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(delay).add(1);
      await freezeTime(newBlockTimestamp.toNumber());
      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });
      let xvsTokenBalanceOfAliceAfterConversion = await call(xvsToken, "balanceOf", [alice]);
      const expectedXVSBalance = new BigNumber(vrtTransferAmount).multipliedBy(conversionRatio).dividedBy(new BigNumber(1e18));
      expect(new BigNumber(xvsTokenBalanceOfAliceAfterConversion)).toEqual(expectedXVSBalance);

      let vrtTokensInConversion = await call(vrtToken, "balanceOf", [vrtConversionAddress]);
      expect(new BigNumber(vrtTokensInConversion)).toEqual(new BigNumber(0));

      let vrtTokensInBurnAddress = await call(vrtToken, "balanceOf", [BURN_ADDRESS]);
      expect(new BigNumber(vrtTokensInBurnAddress)).toEqual(new BigNumber(vrtTransferAmount));

      expect(convertVRTTxn).toHaveLog('TokenConverted', {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        xvsAddress: xvsTokenAddress,
        vrtAmount: vrtTransferAmount,
        xvsAmount: xvsTokenBalanceOfAliceAfterConversion
      });

    });

  });

});
