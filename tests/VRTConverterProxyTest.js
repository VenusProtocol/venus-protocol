const { address, bnbUnsigned, mergeInterface, freezeTime } = require("./Utils/BSC");

const BigNum = require("bignumber.js");

let accounts = [];

describe("VRTConverterProxy", () => {
  let root, alice, bob; // eslint-disable-line @typescript-eslint/no-unused-vars
  let vrtConversion,
    vrtConversionAddress,
    vrtConverterProxy,
    vrtConverterProxyAddress,
    vrtConverterProxyAdmin,
    vrtToken,
    vrtTokenAddress,
    xvsToken,
    xvsTokenAddress;
  let xvsVestingProxy, xvsVestingProxyAddress, xvsVestingProxyAdmin; // eslint-disable-line @typescript-eslint/no-unused-vars
  let conversionRatio, conversionStartTime, conversionPeriod;
  let xvsVesting, xvsVestingAddress;

  beforeEach(async () => {
    [root, alice, bob, ...accounts] = saddle.accounts;

    const blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;
    conversionPeriod = 360 * 24 * 60 * 60;

    // 12,000 VRT =  1 XVS
    // 1 VRT = 1/12,000 = 0.000083
    conversionRatio = new BigNum(0.000083e18);

    //deploy VRT
    vrtToken = await deploy("VRT", [root]);
    vrtTokenAddress = vrtToken._address;

    //deploy XVS
    xvsToken = await deploy("XVS", [root]);
    xvsTokenAddress = xvsToken._address;

    xvsVesting = await deploy("XVSVestingHarness");
    xvsVestingAddress = xvsVesting._address;

    //deploy XVSVestingProxy
    xvsVestingProxy = await deploy("XVSVestingProxy", [xvsVestingAddress, xvsTokenAddress]);
    xvsVestingProxyAddress = xvsVestingProxy._address;
    xvsVestingProxyAdmin = await call(xvsVestingProxy, "admin");

    //deploy VRTConversion
    vrtConversion = await deploy("VRTConverterHarness");
    vrtConversionAddress = vrtConversion._address;

    vrtConverterProxy = await deploy(
      "VRTConverterProxy",
      [vrtConversionAddress, vrtTokenAddress, xvsTokenAddress, conversionRatio, conversionStartTime, conversionPeriod],
      { from: root },
    );

    vrtConverterProxyAddress = vrtConverterProxy._address;
    vrtConverterProxyAdmin = await call(vrtConverterProxy, "admin");

    mergeInterface(vrtConverterProxy, vrtConversion);
    mergeInterface(xvsVestingProxy, xvsVesting);

    await send(vrtConverterProxy, "setXVSVesting", [xvsVestingProxyAddress]);
    await send(xvsVestingProxy, "setVRTConverter", [vrtConverterProxyAddress]);
  });

  describe("constructor", () => {
    it("sets admin to caller and addresses to 0", async () => {
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toBeAddressZero();
      expect(await call(vrtConverterProxy, "pendingImplementation")).toBeAddressZero();
      expect(await call(vrtConverterProxy, "implementation")).toEqual(vrtConversionAddress);

      const vrtAddressResp = await call(vrtConverterProxy, "vrt");
      expect(vrtAddressResp).toEqual(vrtTokenAddress);

      const xvsAddressResp = await call(vrtConverterProxy, "xvs");
      expect(xvsAddressResp).toEqual(xvsTokenAddress);

      const xvsVestingAddressResp = await call(vrtConverterProxy, "xvsVesting");
      expect(xvsVestingAddressResp).toEqual(xvsVestingProxyAddress);

      const conversionRatioResp = await call(vrtConverterProxy, "conversionRatio");
      expect(new BigNum(conversionRatioResp)).toEqual(new BigNum(conversionRatio));

      const conversionStartTimeResp = await call(vrtConverterProxy, "conversionStartTime");
      expect(new BigNum(conversionStartTimeResp)).toEqual(new BigNum(conversionStartTime));

      const conversionPeriodResp = await call(vrtConverterProxy, "conversionPeriod");
      expect(new BigNum(conversionPeriodResp)).toEqual(new BigNum(conversionPeriod));
    });
  });

  describe("_setPendingImplementation", () => {
    describe("Check caller is admin", () => {
      it("does not change pending implementation address", async () => {
        await expect(
          send(vrtConverterProxy, "_setPendingImplementation", [vrtConversion._address], { from: accounts[1] }),
        ).rejects.toRevert("revert Only admin can set Pending Implementation");
        expect(await call(vrtConverterProxy, "pendingImplementation")).toBeAddressZero();
      });
    });

    describe("succeeding", () => {
      it("stores pendingImplementation with value newPendingImplementation", async () => {
        const result = await send(vrtConverterProxy, "_setPendingImplementation", [vrtConversion._address], {
          from: root,
        });
        expect(await call(vrtConverterProxy, "pendingImplementation")).toEqual(vrtConversion._address);
        expect(result).toHaveLog("NewPendingImplementation", {
          oldPendingImplementation: address(0),
          newPendingImplementation: vrtConversionAddress,
        });
      });
    });
  });

  describe("_acceptImplementation", () => {
    it("Check caller is pendingImplementation  and pendingImplementation ≠ address(0) ", async () => {
      expect(await send(vrtConverterProxy, "_setPendingImplementation", [vrtConversion._address], { from: root }));
      await expect(send(vrtConverterProxy, "_acceptImplementation", { from: root })).rejects.toRevert(
        "revert only address marked as pendingImplementation can accept Implementation",
      );
      expect(await call(vrtConverterProxy, "implementation")).not.toEqual(vrtConverterProxy._address);
    });
  });

  describe("the vrtConversionImpl must accept the responsibility of implementation", () => {
    let result;
    beforeEach(async () => {
      await send(vrtConverterProxy, "_setPendingImplementation", [vrtConversion._address], { from: root });
      const pendingVRTConversionImpl = await call(vrtConverterProxy, "pendingImplementation");
      expect(pendingVRTConversionImpl).toEqual(vrtConversion._address);
    });

    it("Store implementation with value pendingImplementation", async () => {
      vrtConverterProxyAdmin = await call(vrtConverterProxy, "admin");
      result = await send(vrtConversion, "_become", [vrtConverterProxy._address], { from: vrtConverterProxyAdmin });
      expect(result).toSucceed();
      expect(await call(vrtConverterProxy, "implementation")).toEqual(vrtConversion._address);
      expect(await call(vrtConverterProxy, "pendingImplementation")).toBeAddressZero();
    });
  });

  describe("Upgrade VRTConversion", () => {
    it("should update the implementation and assert the existing-storage on upgraded implementation", async () => {
      vrtConversion = await deploy("VRTConverterHarness", [], { from: root });
      vrtConversionAddress = vrtConversion._address;

      await send(vrtConverterProxy, "_setPendingImplementation", [vrtConversionAddress], { from: root });
      await send(vrtConversion, "_become", [vrtConverterProxy._address], { from: vrtConverterProxyAdmin });

      const vrtConverterImplementationFromProxy = await call(vrtConverterProxy, "implementation", []);
      expect(vrtConverterImplementationFromProxy).toEqual(vrtConversionAddress);

      const vrtAddressResp = await call(vrtConverterProxy, "vrt");
      expect(vrtAddressResp).toEqual(vrtTokenAddress);

      const xvsAddressResp = await call(vrtConverterProxy, "xvs");
      expect(xvsAddressResp).toEqual(xvsTokenAddress);

      const xvsVestingAddressResp = await call(vrtConverterProxy, "xvsVesting");
      expect(xvsVestingAddressResp).toEqual(xvsVestingProxyAddress);

      const conversionRatioResp = await call(vrtConverterProxy, "conversionRatio");
      expect(new BigNum(conversionRatioResp)).toEqual(new BigNum(conversionRatio));

      const conversionStartTimeResp = await call(vrtConverterProxy, "conversionStartTime");
      expect(new BigNum(conversionStartTimeResp)).toEqual(new BigNum(conversionStartTime));

      const conversionPeriodResp = await call(vrtConverterProxy, "conversionPeriod");
      expect(new BigNum(conversionPeriodResp)).toEqual(new BigNum(conversionPeriod));
    });
  });

  describe("admin()", () => {
    it("should return correct admin", async () => {
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
    });
  });

  describe("pendingAdmin()", () => {
    it("should return correct pending admin", async () => {
      expect(await call(vrtConverterProxy, "pendingAdmin")).toBeAddressZero();
    });
  });

  describe("_setPendingAdmin()", () => {
    it("should only be callable by admin", async () => {
      await expect(send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]], { from: accounts[0] })).rejects.toRevert(
        "revert only admin can set pending admin",
      );

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toBeAddressZero();
    });

    it("should properly set pending admin", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should properly set pending admin twice", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toEqual(accounts[1]);
    });

    it("should emit event", async () => {
      const result = await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]]);
      expect(result).toHaveLog("NewPendingAdmin", {
        oldPendingAdmin: address(0),
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe("_acceptAdmin()", () => {
    it("should fail when pending admin is zero", async () => {
      await expect(send(vrtConverterProxy, "_acceptAdmin")).rejects.toRevert(
        "revert only address marked as pendingAdmin can accept as Admin",
      );

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toBeAddressZero();
    });

    it("should fail when called by another account (e.g. root)", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      await expect(send(vrtConverterProxy, "_acceptAdmin")).rejects.toRevert(
        "revert only address marked as pendingAdmin can accept as Admin",
      );

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should fail on multiple attempts of same address is set as PendingAdmin", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      await expect(send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).rejects.toRevert(
        "revert New pendingAdmin can not be same as the previous one",
      );
    });

    it("should succeed on multiple attempts of different address is set as PendingAdmin", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(root);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toEqual(accounts[1]);
    });

    it("should succeed and set admin and clear pending admin", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      expect(await send(vrtConverterProxy, "_acceptAdmin", [], { from: accounts[0] })).toSucceed();

      // Check admin stays the same
      expect(await call(vrtConverterProxy, "admin")).toEqual(accounts[0]);
      expect(await call(vrtConverterProxy, "pendingAdmin")).toBeAddressZero();
    });

    it("should emit log on success", async () => {
      expect(await send(vrtConverterProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      const result = await send(vrtConverterProxy, "_acceptAdmin", [], { from: accounts[0] });
      expect(result).toHaveLog("NewAdmin", {
        oldAdmin: root,
        newAdmin: accounts[0],
      });
      expect(result).toHaveLog("NewPendingAdmin", {
        oldPendingAdmin: accounts[0],
        newPendingAdmin: address(0),
      });
    });
  });
});
