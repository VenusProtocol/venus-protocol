const {
  address,
  bnbUnsigned
} = require('../Utils/BSC');
const interestRatePerBlock = bnbUnsigned(28935185000);

describe('VRTVaultProxy', () => {
  let root, notAdmin, accounts;
  let vaultProxy, vaultProxyAdmin;
  let vaultImpl;
  let vrt, vrtAddress, vrtVaultAddress;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    [root, notAdmin] = accounts;


    vrt = await deploy('VRT', [root], { from: root });
    vrtAddress = vrt._address;

    vaultImpl = await deploy('VRTVaultHarness', [vrtAddress, interestRatePerBlock], { from: root });
    vrtVaultAddress = vaultImpl._address;

    vaultProxy = await deploy('VRTVaultProxy', { from: root });
    vaultProxyAdmin = await call(vaultProxy, 'admin');
  });

  let setPending = (implementation, from) => {
    return send(vaultProxy, '_setPendingImplementation', [implementation._address], { from });
  };

  describe("constructor", () => {
    it("sets admin to caller and addresses to 0", async () => {
      expect(await call(vaultProxy, 'admin')).toEqual(root);
      expect(await call(vaultProxy, 'pendingAdmin')).toBeAddressZero();
      expect(await call(vaultProxy, 'pendingVRTVaultImplementation')).toBeAddressZero();
      expect(await call(vaultProxy, 'vrtVaultImplementation')).toBeAddressZero();
    });
  });

  describe("_setPendingImplementation", () => {
    describe("Check caller is admin", () => {
      let result;
      beforeEach(async () => {
        result = await setPending(vaultImpl, accounts[1]);
      });

      it("does not change pending implementation address", async () => {
        expect(await call(vaultProxy, 'pendingVRTVaultImplementation')).toBeAddressZero()
      });
    });

    describe("succeeding", () => {
      it("stores pendingVRTVaultImplementation with value newPendingImplementation", async () => {
        const result = await setPending(vaultImpl, root);
        expect(await call(vaultProxy, 'pendingVRTVaultImplementation')).toEqual(vaultImpl._address);
        expect(result).toHaveLog('NewPendingImplementation', {
          oldPendingImplementation: address(0),
          newPendingImplementation: vrtVaultAddress
        });
      });

    });
  });

  describe("_acceptImplementation", () => {
    describe("Check caller is pendingVRTVaultImplementation  and pendingVRTVaultImplementation ≠ address(0) ", () => {
      let result;
      beforeEach(async () => {
        await setPending(vaultProxy, root);
        result = await send(vaultProxy, '_acceptImplementation');
      });

      it("emits a failure log", async () => {
        expect(result).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK');
        expect(await call(vaultProxy, 'vrtVaultImplementation')).not.toEqual(vaultProxy._address);
      });

    });

    describe("the vaultImpl must accept the responsibility of implementation", () => {
      let result;
      beforeEach(async () => {
        await setPending(vaultImpl, root);
        const pendingVRTVaultImpl = await call(vaultProxy, 'pendingVRTVaultImplementation');
        expect(pendingVRTVaultImpl).toEqual(vaultImpl._address);
      });

      it("Store implementation with value pendingVRTVaultImplementation", async () => {
        vaultProxyAdmin = await call(vaultProxy, 'admin');
        result = await send(vaultImpl, '_become', [vaultProxy._address], { from: vaultProxyAdmin });
        expect(result).toSucceed();
        expect(await call(vaultProxy, 'vrtVaultImplementation')).toEqual(vaultImpl._address);
        expect(await call(vaultProxy, 'pendingVRTVaultImplementation')).toBeAddressZero();
      });

    });

  });
});
