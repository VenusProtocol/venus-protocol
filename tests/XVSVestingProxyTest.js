const { address, bnbUnsigned, mergeInterface, freezeTime } = require("./Utils/BSC");

const BigNum = require("bignumber.js");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
let accounts = [];

describe("XVSVestingProxy", () => {
  let root;
  let vrtConversionAddress, vrtToken, xvsToken, xvsTokenAddress;
  let xvsVestingProxy, xvsVestingProxyAdmin;
  let blockTimestamp;
  let vrtConversion,
    vrtConverterProxy,
    vrtConverterProxyAddress,
    conversionStartTime,
    conversionPeriod,
    conversionRatio;
  let xvsVesting, xvsVestingAddress;

  beforeEach(async () => {
    [root, vrtConversionAddress, ...accounts] = saddle.accounts;
    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());

    //deploy VRT
    vrtToken = await deploy("VRT", [root]);
    let vrtTokenAddress = vrtToken._address;

    //deploy XVS
    xvsToken = await deploy("XVS", [root]);
    xvsTokenAddress = xvsToken._address;

    //deploy XVSVesting
    xvsVesting = await deploy("XVSVestingHarness");
    xvsVestingAddress = xvsVesting._address;

    //deploy XVSVestingProxy
    xvsVestingProxy = await deploy("XVSVestingProxy", [xvsVestingAddress, xvsTokenAddress]);
    xvsVestingProxyAdmin = await call(xvsVestingProxy, "admin");
    mergeInterface(xvsVestingProxy, xvsVesting);

    //deploy VRTConversion
    vrtConversion = await deploy("VRTConverterHarness");
    vrtConversionAddress = vrtConversion._address;
    conversionStartTime = blockTimestamp;
    conversionPeriod = 360 * 24 * 60 * 60;
    // 12,000 VRT =  1 XVS
    // 1 VRT = 1/12,000 = 0.000083
    conversionRatio = new BigNum(0.000083e18);

    vrtConverterProxy = await deploy(
      "VRTConverterProxy",
      [vrtConversionAddress, vrtTokenAddress, xvsTokenAddress, conversionRatio, conversionStartTime, conversionPeriod],
      { from: root },
    );
    vrtConverterProxyAddress = vrtConverterProxy._address;
    mergeInterface(vrtConverterProxy, vrtConversion);

    //set VRTConverterProxy in XVSVesting
    await send(xvsVestingProxy, "setVRTConverter", [vrtConverterProxyAddress]);
  });

  describe("constructor", () => {
    it("sets admin to caller and addresses to 0", async () => {
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toBeAddressZero();
      expect(await call(xvsVestingProxy, "pendingImplementation")).toBeAddressZero();
      expect(await call(xvsVestingProxy, "implementation")).toEqual(xvsVestingAddress);

      const xvsAddressResp = await call(xvsVestingProxy, "xvs");
      expect(xvsAddressResp).toEqual(xvsTokenAddress);

      const vrtConversionAddressResp = await call(xvsVestingProxy, "vrtConversionAddress");
      expect(vrtConversionAddressResp).toEqual(vrtConverterProxyAddress);
    });
  });

  describe("_setPendingImplementation", () => {
    describe("Check caller is admin", () => {
      it("does not change pending implementation address", async () => {
        await expect(
          send(xvsVestingProxy, "_setPendingImplementation", [xvsVesting._address], { from: accounts[1] }),
        ).rejects.toRevert("revert Only admin can set Pending Implementation");
        expect(await call(xvsVestingProxy, "pendingImplementation")).toBeAddressZero();
      });
    });

    describe("succeeding", () => {
      it("stores pendingImplementation with value newPendingImplementation", async () => {
        const result = await send(xvsVestingProxy, "_setPendingImplementation", [xvsVesting._address], { from: root });
        expect(await call(xvsVestingProxy, "pendingImplementation")).toEqual(xvsVesting._address);
        expect(result).toHaveLog("NewPendingImplementation", {
          oldPendingImplementation: address(0),
          newPendingImplementation: xvsVestingAddress,
        });
      });
    });

    describe("ZeroAddress as pending implementation", () => {
      it("does not change pending implementation address", async () => {
        await expect(
          send(xvsVestingProxy, "_setPendingImplementation", [ZERO_ADDRESS], { from: accounts[1] }),
        ).rejects.toRevert("revert Address cannot be Zero");
        expect(await call(xvsVestingProxy, "pendingImplementation")).toBeAddressZero();
      });
    });
  });

  describe("_acceptImplementation", () => {
    it("Check caller is pendingImplementation  and pendingImplementation ≠ address(0) ", async () => {
      expect(await send(xvsVestingProxy, "_setPendingImplementation", [xvsVesting._address], { from: root }));
      await expect(send(xvsVestingProxy, "_acceptImplementation", { from: root })).rejects.toRevert(
        "revert only address marked as pendingImplementation can accept Implementation",
      );
      expect(await call(xvsVestingProxy, "implementation")).not.toEqual(xvsVestingProxy._address);
    });
  });

  describe("the XVSVestingImpl must accept the responsibility of implementation", () => {
    let result;
    beforeEach(async () => {
      await send(xvsVestingProxy, "_setPendingImplementation", [xvsVesting._address], { from: root });
      const pendingXVSVestingImpl = await call(xvsVestingProxy, "pendingImplementation");
      expect(pendingXVSVestingImpl).toEqual(xvsVesting._address);
    });

    it("Store implementation with value pendingImplementation", async () => {
      xvsVestingProxyAdmin = await call(xvsVestingProxy, "admin");
      result = await send(xvsVesting, "_become", [xvsVestingProxy._address], { from: xvsVestingProxyAdmin });
      expect(result).toSucceed();
      expect(await call(xvsVestingProxy, "implementation")).toEqual(xvsVesting._address);
      expect(await call(xvsVestingProxy, "pendingImplementation")).toBeAddressZero();
    });
  });

  describe("Upgrade xvsVesting", () => {
    it("should update the implementation and assert the existing-storage on upgraded implementation", async () => {
      xvsVesting = await deploy("XVSVestingHarness", [], { from: root });
      xvsVestingAddress = xvsVesting._address;

      await send(xvsVestingProxy, "_setPendingImplementation", [xvsVestingAddress], { from: root });
      await send(xvsVesting, "_become", [xvsVestingProxy._address], { from: xvsVestingProxyAdmin });

      const xvsVestingImplementationFromProxy = await call(xvsVestingProxy, "implementation", []);
      expect(xvsVestingImplementationFromProxy).toEqual(xvsVestingAddress);

      const xvsAddressResp = await call(xvsVestingProxy, "xvs");
      expect(xvsAddressResp).toEqual(xvsTokenAddress);

      const vrtConversionAddressResp = await call(xvsVestingProxy, "vrtConversionAddress");
      expect(vrtConversionAddressResp).toEqual(vrtConverterProxyAddress);
    });
  });

  describe("admin()", () => {
    it("should return correct admin", async () => {
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
    });
  });

  describe("pendingAdmin()", () => {
    it("should return correct pending admin", async () => {
      expect(await call(xvsVestingProxy, "pendingAdmin")).toBeAddressZero();
    });
  });

  describe("_setPendingAdmin()", () => {
    it("should only be callable by admin", async () => {
      await expect(send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]], { from: accounts[0] })).rejects.toRevert(
        "revert only admin can set pending admin",
      );

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toBeAddressZero();
    });

    it("should properly set pending admin", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should properly set pending admin twice", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toEqual(accounts[1]);
    });

    it("should emit event", async () => {
      const result = await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]]);
      expect(result).toHaveLog("NewPendingAdmin", {
        oldPendingAdmin: address(0),
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe("_acceptAdmin()", () => {
    it("should fail when pending admin is zero", async () => {
      await expect(send(xvsVestingProxy, "_acceptAdmin")).rejects.toRevert(
        "revert only address marked as pendingAdmin can accept as Admin",
      );

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toBeAddressZero();
    });

    it("should fail when called by another account (e.g. root)", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      await expect(send(xvsVestingProxy, "_acceptAdmin")).rejects.toRevert(
        "revert only address marked as pendingAdmin can accept as Admin",
      );

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should fail on attempt to set zeroAddress as admin", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      await expect(send(xvsVestingProxy, "_setPendingAdmin", [ZERO_ADDRESS])).rejects.toRevert(
        "revert Address cannot be Zero",
      );

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toEqual(accounts[0]);
    });

    it("should fail on multiple attempts of same address is set as PendingAdmin", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      await expect(send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).rejects.toRevert(
        "revert New pendingAdmin can not be same as the previous one",
      );
    });

    it("should succeed on multiple attempts of different address is set as PendingAdmin", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(root);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toEqual(accounts[1]);
    });

    it("should succeed and set admin and clear pending admin", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      expect(await send(xvsVestingProxy, "_acceptAdmin", [], { from: accounts[0] })).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVestingProxy, "admin")).toEqual(accounts[0]);
      expect(await call(xvsVestingProxy, "pendingAdmin")).toBeAddressZero();
    });

    it("should emit log on success", async () => {
      expect(await send(xvsVestingProxy, "_setPendingAdmin", [accounts[0]])).toSucceed();
      const result = await send(xvsVestingProxy, "_acceptAdmin", [], { from: accounts[0] });
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
