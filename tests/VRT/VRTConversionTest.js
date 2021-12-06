const BigNumber = require('bignumber.js');

const {
  freezeTime,
  bnbUnsigned
} = require('../Utils/BSC');

const { makeToken } = require('../Utils/Venus');

describe('VRTConversionProxy', () => {
  let root, accounts;
  let vrtConversion, vrtConversionAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp;
  let conversionRatio, conversionStartTime;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;

    blockTimestamp = bnbUnsigned(100);
    conversionStartTime = blockTimestamp;
    await freezeTime(blockTimestamp.toNumber());
    conversionRatio = new BigNumber(0.75e18);

    //deploy VRT
    // Create New Bep20 Token
    vrtToken = await makeToken();
    vrtTokenAddress = vrtToken._address;

    //deploy XVS
    xvsToken = await deploy('XVS', [root]);
    xvsTokenAddress = xvsToken._address;

    //deploy VRTConversion
    vrtConversion = await deploy('VRTConversion', [vrtTokenAddress, xvsTokenAddress]);
    vrtConversionAddress = vrtConversion._address;

    //set conversionInfo
    await send(vrtConversion, '_setXVSVRTConversionInfo', [conversionRatio, conversionStartTime]);
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
      expect(parseInt(vrtDecimalsMultiplierQueryResponse)).toEqual(10**18);
    });

    it("sets decimalsMultiplier for  XVS", async () => {
      let xvsDecimalsMultiplierQueryResponse = await call(vrtConversion, "xvsDecimalsMultiplier");
      expect(parseInt(xvsDecimalsMultiplierQueryResponse)).toEqual(10**18);
    });

  });

});
