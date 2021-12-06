const BigNumber = require('bignumber.js');

const {
  freezeTime,
  bnbUnsigned
} = require('../Utils/BSC');

const { makeToken } = require('../Utils/Venus');

describe('VRTConversionProxy', () => {
  let root, accounts;
  let vrtConversionProxy, vrtConversionProxyAddress,
    vrtConversion, vrtConversionAddress,
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

    vrtConversion = await deploy('VRTConversion', [vrtTokenAddress, xvsTokenAddress]);
    vrtConversionAddress = vrtConversion._address;

    vrtConversionProxy = await deploy('VRTConversionProxy');
    vrtConversionProxyAddress = vrtConversionProxy._address;

    await send(vrtConversionProxy, '_setPendingImplementation', [vrtConversionAddress], { root });

    result = await send(vrtConversion, '_become', [vrtConversionProxyAddress]);

    await send(vrtConversion, '_setXVSVRTConversionInfo', [conversionRatio, conversionStartTime]);
  });

  describe("constructor", () => {
    it("sets conversionRatio for VTR -> XVS", async () => {
      let conversionRatioQueryResponse = await call(vrtConversion, "conversionRatio");
      expect(parseFloat(conversionRatioQueryResponse)).toEqual(parseFloat(conversionRatio));
    });

    it("sets conversionStartTime for VTR -> XVS", async () => {
      let conversionStartTimeQueryResponse = await call(vrtConversion, "conversionStartTime");
      expect(parseInt(conversionStartTimeQueryResponse)).toEqual(parseInt(conversionStartTime));
    });

  });

});
