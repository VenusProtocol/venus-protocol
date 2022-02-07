const BigNumber = require('bignumber.js');
const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime,
  address
} = require('../Utils/BSC');

const BLOCKS_PER_DAY = (new BigNumber(24).multipliedBy(new BigNumber(3600))).dividedToIntegerBy(new BigNumber(3));
const VESTING_PERIOD = new BigNumber(360).multipliedBy(BLOCKS_PER_DAY);

const calculatedExpectedWithdrawalAmount = (totalVestedAmount, withdrawnAmount, startBlock, blockNumber) => {
  const blockDiff = new BigNumber(blockNumber).minus(new BigNumber(startBlock));
  const unlockedAmount = (new BigNumber(totalVestedAmount).multipliedBy(blockDiff)).dividedToIntegerBy(VESTING_PERIOD);
  const amount = new BigNumber(totalVestedAmount).minus(new BigNumber(withdrawnAmount));
  return (amount.isGreaterThanOrEqualTo(unlockedAmount) ? unlockedAmount : amount);
};

const getBlocksbyDays = (numberOfDays) => {
  return (BLOCKS_PER_DAY.multipliedBy(new BigNumber(numberOfDays)));
}

const setBlockNumber = async (xvsVesting, blockNumber) => {
  await send(xvsVesting, 'setBlockNumber', [bnbUnsigned(blockNumber)]);
}

const incrementBlocks = async (xvsVesting, deltaBlocks) => {
  const blockNumberInVestingContract = await call(xvsVesting, 'getBlockNumber');
  const blockNumber = new BigNumber(blockNumberInVestingContract).plus(new BigNumber(deltaBlocks));
  await setBlockNumber(xvsVesting, [blockNumber]);
}

const getBlockNumber = async (xvsVesting) => {
  const blockNumber = await call(xvsVesting, 'getBlockNumber');
  return blockNumber;
}


const getWithdrawableAmount = async (currentBlockNumber, vestingStartBlock, totalVestedAmount, withdrawnAmount) => {
  const unlocked = (new BigNumber(totalVestedAmount).multipliedBy(new BigNumber(currentBlockNumber).minus(new BigNumber(vestingStartBlock)))).dividedToIntegerBy(VESTING_PERIOD);
  const amount = new BigNumber(totalVestedAmount).minus(new BigNumber(withdrawnAmount));
  return (amount.isGreaterThanOrEqualTo(unlocked) ? unlocked : amount);
}

describe('XVSVesting', () => {
  let root, alice, bob, redeemerAddress, randomAddress;
  let vrtConversion, vrtConversionAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp, delay = 10;
  let conversionRatio, conversionRatioMultiplier, conversionStartTime, vrtDailyLimit, vrtTotalSupply;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint, xvsTokenMintAmount;
  let xvsVesting, xvsVestingAddress, xvsPerDay;

  beforeEach(async () => {
    [root, alice, bob, vrtConversionAddress, redeemerAddress, randomAddress, ...accounts] = saddle.accounts;
    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;
    conversionRatioMultiplier = 0.75;
    conversionRatio = new BigNumber(0.75e18);
    vrtTotalSupply = bnbMantissa(2000000000);

    //deploy VRT
    vrtToken = await deploy('VRT', [root]);

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

    xvsPerDay = bnbMantissa(10000);
    xvsVesting = await deploy('XVSVestingHarness', [xvsTokenAddress, xvsPerDay]);
    xvsVestingAddress = xvsVesting._address;

    xvsTokenMintAmount = bnbMantissa(100000);
    await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });
    await send(xvsVesting, '_setVRTConversion', [vrtConversionAddress], { from: root });
  });

  describe("constructor", () => {

    it("sets vrtConversion Address in XVSVesting", async () => {
      let vrtConversionAddressActual = await call(xvsVesting, "vrtConversionAddress");
      expect(vrtConversionAddressActual).toEqual(vrtConversionAddress);
    });

    it("sets XVS Address in XVSVesting", async () => {
      let xvsAddressActual = await call(xvsVesting, "xvs");
      expect(xvsAddressActual).toEqual(xvsTokenAddress);
    });
  });

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await call(xvsVesting, 'admin')).toEqual(root);
    });
  });

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero()
    });
  });

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      await expect(send(xvsVesting, '_setPendingAdmin', [accounts[0]], { from: accounts[0] }))
        .rejects.toRevert('revert Only Admin can set the PendingAdmin');

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero();
    });

    it('should properly set pending admin', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should properly set pending admin twice', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toEqual(accounts[1]);
    });

    it('should emit event', async () => {
      const result = await send(xvsVesting, '_setPendingAdmin', [accounts[0]]);
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: address(0),
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      await expect(send(xvsVesting, '_acceptAdmin')).rejects.toRevert('revert Only PendingAdmin can accept as Admin');

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero();
    });

    it('should fail when called by another account (e.g. root)', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      await expect(send(xvsVesting, '_acceptAdmin')).rejects.toRevert('revert Only PendingAdmin can accept as Admin');

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(root);
      expect(await call(xvsVesting, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should succeed and set admin and clear pending admin', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(xvsVesting, '_acceptAdmin', [], { from: accounts[0] })).toSucceed();

      // Check admin stays the same
      expect(await call(xvsVesting, 'admin')).toEqual(accounts[0]);
      expect(await call(xvsVesting, 'pendingAdmin')).toBeAddressZero();
    });

    it('should emit log on success', async () => {
      expect(await send(xvsVesting, '_setPendingAdmin', [accounts[0]])).toSucceed();
      const result = await send(xvsVesting, '_acceptAdmin', [], { from: accounts[0] });
      expect(result).toHaveLog('NewAdmin', {
        oldAdmin: root,
        newAdmin: accounts[0],
      });
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: accounts[0],
        newPendingAdmin: address(0),
      });
    });

  });

});