const {
    address,
    bnbUnsigned,
    mergeInterface,
    freezeTime
} = require('./Utils/BSC');

const BigNum = require('bignumber.js');

describe('XVSVestingProxy', () => {
    let root;
    let vrtConversionAddress,
        vrtToken,
        xvsToken, xvsTokenAddress;
    let xvsVestingProxy, xvsVestingProxyAddress, xvsVestingProxyAdmin;
    let blockTimestamp;
    let xvsVesting, xvsVestingAddress;

    beforeEach(async () => {
        [root, vrtConversionAddress, ...accounts] = saddle.accounts;
        blockTimestamp = bnbUnsigned(100);
        await freezeTime(blockTimestamp.toNumber());

        //deploy VRT
        vrtToken = await deploy('VRT', [root]);
        vrtTokenAddress = vrtToken._address;

        //deploy XVS
        xvsToken = await deploy('XVS', [root]);
        xvsTokenAddress = xvsToken._address;

        //deploy XVSVesting
        xvsVesting = await deploy('XVSVestingHarness');
        xvsVestingAddress = xvsVesting._address;

        //deploy XVSVestingProxy
        xvsVestingProxy = await deploy("XVSVestingProxy", [xvsVestingAddress, xvsTokenAddress, vrtConversionAddress]);
        xvsVestingProxyAddress = xvsVestingProxy._address;
        xvsVestingProxyAdmin = await call(xvsVestingProxy, "admin");

        mergeInterface(xvsVestingProxy, xvsVesting);
    });

    describe("constructor", () => {
        it("sets admin to caller and addresses to 0", async () => {
            expect(await call(xvsVestingProxy, 'admin')).toEqual(root);
            expect(await call(xvsVestingProxy, 'pendingAdmin')).toBeAddressZero();
            expect(await call(xvsVestingProxy, 'pendingImplementation')).toBeAddressZero();
            expect(await call(xvsVestingProxy, 'implementation')).toEqual(xvsVestingAddress);

            const xvsAddressResp = await call(xvsVestingProxy, 'xvs');
            expect(xvsAddressResp).toEqual(xvsTokenAddress);

            const vrtConversionAddressResp = await call(xvsVestingProxy, 'vrtConversionAddress');
            expect(vrtConversionAddressResp).toEqual(vrtConversionAddress);
        });
    });

    describe("_setPendingImplementation", () => {
        describe("Check caller is admin", () => {
            it("does not change pending implementation address", async () => {
                await expect(send(xvsVestingProxy, '_setPendingImplementation', [xvsVesting._address], { from: accounts[1] }))
                    .rejects.toRevert("revert Only admin can set Pending Implementation");
                expect(await call(xvsVestingProxy, 'pendingImplementation')).toBeAddressZero()
            });
        });

        describe("succeeding", () => {
            it("stores pendingImplementation with value newPendingImplementation", async () => {
                const result = await send(xvsVestingProxy, '_setPendingImplementation', [xvsVesting._address], { from: root });
                expect(await call(xvsVestingProxy, 'pendingImplementation')).toEqual(xvsVesting._address);
                expect(result).toHaveLog('NewPendingImplementation', {
                    oldPendingImplementation: address(0),
                    newPendingImplementation: xvsVestingAddress
                });
            });

        });
    });

    describe("_acceptImplementation", () => {
        it("Check caller is pendingImplementation  and pendingImplementation ≠ address(0) ", async () => {
            expect(await send(xvsVestingProxy, '_setPendingImplementation', [xvsVesting._address], { from: root }));
            await expect(send(xvsVestingProxy, '_acceptImplementation', { from: root }))
                .rejects.toRevert("revert only address marked as pendingImplementation can accept Implementation");
            expect(await call(xvsVestingProxy, 'implementation')).not.toEqual(xvsVestingProxy._address);
        });
    });

    describe("the XVSVestingImpl must accept the responsibility of implementation", () => {
        let result;
        beforeEach(async () => {
            await send(xvsVestingProxy, '_setPendingImplementation', [xvsVesting._address], { from: root })
            const pendingXVSVestingImpl = await call(xvsVestingProxy, 'pendingImplementation');
            expect(pendingXVSVestingImpl).toEqual(xvsVesting._address);
        });

        it("Store implementation with value pendingImplementation", async () => {
            xvsVestingProxyAdmin = await call(xvsVestingProxy, 'admin');
            result = await send(xvsVesting, '_become', [xvsVestingProxy._address], { from: xvsVestingProxyAdmin });
            expect(result).toSucceed();
            expect(await call(xvsVestingProxy, 'implementation')).toEqual(xvsVesting._address);
            expect(await call(xvsVestingProxy, 'pendingImplementation')).toBeAddressZero();
        });

    });


    describe("Upgrade xvsVesting", () => {

        it("should update the implementation and assert the existing-storage on upgraded implementation", async () => {

            xvsVesting = await deploy('XVSVestingHarness', [], { from: root });
            xvsVestingAddress = xvsVesting._address;

            await send(xvsVestingProxy, '_setPendingImplementation', [xvsVestingAddress], { from: root });
            await send(xvsVesting, '_become', [xvsVestingProxy._address], { from: xvsVestingProxyAdmin });

            const xvsVestingImplementationFromProxy = await call(xvsVestingProxy, "implementation", []);
            expect(xvsVestingImplementationFromProxy).toEqual(xvsVestingAddress);

            const xvsAddressResp = await call(xvsVestingProxy, 'xvs');
            expect(xvsAddressResp).toEqual(xvsTokenAddress);

            const vrtConversionAddressResp = await call(xvsVestingProxy, 'vrtConversionAddress');
            expect(vrtConversionAddressResp).toEqual(vrtConversionAddress);
        });

    });

});