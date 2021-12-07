const BigNumber = require('bignumber.js');

const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime
} = require('../Utils/BSC');

const { makeToken } = require('../Utils/Venus');

describe('VRTConversionProxy', () => {
  let root, alice, bob;
  let vrtConversion, vrtConversionAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp, delay = 10;
  let conversionRatio, conversionStartTime;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint, xvsTokenMintAmount;

  beforeEach(async () => {
    [root, alice, bob, ...accounts] = saddle.accounts;

    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;

    conversionRatio = new BigNumber(0.75e18);

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
    vrtConversion = await deploy('VRTConversion', [vrtTokenAddress, xvsTokenAddress]);
    vrtConversionAddress = vrtConversion._address;
    xvsTokenMintAmount = bnbMantissa(100000);
    await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });

    //set conversionInfo
    const setConversionInfoTxn = await send(vrtConversion, '_setXVSVRTConversionInfo', [conversionRatio, conversionStartTime]);

    expect(setConversionInfoTxn).toHaveLog('ConversionInfoSet', {
      conversionRatio: conversionRatio,
      conversionStartTime: conversionStartTime
    });
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

  describe("convert VRT to XVS with incorrect conversionInfo", () => {

    beforeEach(async () => {
      await send(vrtConversion, '_setXVSVRTConversionInfo', [0, conversionStartTime]);
    });

    it("alice can convert her VRT to XVS as conversion ratio is incorrect", async () => {
      vrtTransferAmount = bnbMantissa(1000000000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(delay).add(1);
      await freezeTime(newBlockTimestamp.toNumber());
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice }))
        .rejects.toRevert('revert conversion ratio is incorrect');
    });

  });

  describe("convert VRT to XVS", () => {

    it("alice cannot convert her VRT to XVS - as VRTAmount is invalid", async () => {
      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      await expect(send(vrtConversion, "convert", [0], { from: alice }))
        .rejects.toRevert('revert VRT amount must be non-zero');
    });

    it("alice cannot convert her VRT to XVS as conversionStartTime is in future", async () => {
      vrtTransferAmount = bnbMantissa(100);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });

      const newBlockTimestamp = blockTimestamp.sub(delay);
      await freezeTime(newBlockTimestamp.toNumber());

      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice }))
        .rejects.toRevert('revert conversions didnot start yet');
    });

    it("alice can convert her VRT to XVS as conversionContract doesnot have sufficient XVS-Amount", async () => {
      vrtTransferAmount = bnbMantissa(1000000000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(delay).add(1);
      await freezeTime(newBlockTimestamp.toNumber());
      await expect(send(vrtConversion, "convert", [vrtTransferAmount], { from: alice }))
        .rejects.toRevert('revert not enough XVSTokens');
    });

    it("alice can convert her VRT to XVS", async () => {
      vrtTransferAmount = bnbMantissa(10000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(delay).add(1);
      await freezeTime(newBlockTimestamp.toNumber());
      const convertVRTTxn = await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });
      let xvsTokenBalanceOfAliceAfterConversion = await call(xvsToken, "balanceOf", [alice]);
      const expectedXVSBalance = new BigNumber(vrtTransferAmount).multipliedBy(conversionRatio).dividedBy(new BigNumber(1e18));
      expect(new BigNumber(xvsTokenBalanceOfAliceAfterConversion)).toEqual(expectedXVSBalance);

      expect(convertVRTTxn).toHaveLog('TokenConverted', {
        reedeemer: alice,
        vrtAddress: vrtTokenAddress,
        xvsAddress: xvsTokenAddress,
        vrtAmount: vrtTransferAmount,
        xvsAmount: xvsTokenBalanceOfAliceAfterConversion
      });

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

    it("Admin can withdraw VRT from VRTConversion", async () => {

      vrtTransferAmount = bnbMantissa(10000);
      await send(vrtToken, "approve", [vrtConversionAddress, vrtTransferAmount], { from: alice });
      const newBlockTimestamp = blockTimestamp.add(delay).add(1);
      await freezeTime(newBlockTimestamp.toNumber());
      await send(vrtConversion, "convert", [vrtTransferAmount], { from: alice });

      const vrtBalanceOfRoot_BeforeWithdrawal = await call(vrtToken, "balanceOf", [root]);
      const vrtBalanceOfVRTConversion_BeforeWithdrawal = await call(vrtToken, "balanceOf", [vrtConversionAddress]);

      const withdrawVRTTxn = await send(vrtConversion, "withdraw", [vrtTokenAddress, vrtTransferAmount, root], { from: root });

      const vrtBalanceOfRoot_AfterWithdrawal = await call(vrtToken, "balanceOf", [root]);
      const vrtBalanceOfVRTConversion_AfterWithdrawal = await call(vrtToken, "balanceOf", [vrtConversionAddress]);

      expect(bnbUnsigned(vrtBalanceOfVRTConversion_AfterWithdrawal)).toEqual(bnbUnsigned(0));

      const expected_VRTBalanceOfRoot_AfterWithdrawal = (bnbUnsigned(vrtBalanceOfRoot_BeforeWithdrawal))
        .add(bnbUnsigned(vrtBalanceOfVRTConversion_BeforeWithdrawal));

      expect(bnbUnsigned(vrtBalanceOfRoot_AfterWithdrawal)).toEqual(bnbUnsigned(expected_VRTBalanceOfRoot_AfterWithdrawal));

      expect(withdrawVRTTxn).toHaveLog('TokenWithdraw', {
        token: vrtTokenAddress,
        to: root,
        amount: vrtTransferAmount
      });
    });

  });

});
