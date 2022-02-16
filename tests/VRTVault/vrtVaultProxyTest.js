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
      it("does not change pending implementation address", async () => {
        await expect( send(vaultProxy, '_setPendingImplementation', [vaultImpl._address], {from: accounts[1]} ) )
        .rejects.toRevert("revert Only admin can set Pending Implementation");
        expect(await call(vaultProxy, 'pendingVRTVaultImplementation')).toBeAddressZero()
      });
    });

    describe("succeeding", () => {
      it("stores pendingVRTVaultImplementation with value newPendingImplementation", async () => {
        console.log(`vaultProxyAdmin is: ${vaultProxyAdmin} - root: ${root}`);
        const result = await send(vaultProxy, '_setPendingImplementation', [vaultImpl._address], {from: root});
        expect(await call(vaultProxy, 'pendingVRTVaultImplementation')).toEqual(vaultImpl._address);
        expect(result).toHaveLog('NewPendingImplementation', {
          oldPendingImplementation: address(0),
          newPendingImplementation: vrtVaultAddress
        });
      });

    });
  });

  describe("_acceptImplementation", () => {
    it("Check caller is pendingVRTVaultImplementation  and pendingVRTVaultImplementation ≠ address(0) ", async () => {
        expect(await send(vaultProxy, '_setPendingImplementation', [vaultImpl._address], {from: root}));
        await expect(send(vaultProxy, '_acceptImplementation', {from: root}))
        .rejects.toRevert("revert only address marked as pendingImplementation can accept Implementation");
        expect(await call(vaultProxy, 'vrtVaultImplementation')).not.toEqual(vaultProxy._address);
      });
    });

    describe("the vaultImpl must accept the responsibility of implementation", () => {
      let result;
      beforeEach(async () => {
        await send(vaultProxy, '_setPendingImplementation', [vaultImpl._address], {from: root})
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

