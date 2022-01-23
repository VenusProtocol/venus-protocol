const BigNumber = require('bignumber.js');

const {
  bnbUnsigned,
  bnbMantissa,
  freezeTime,
  advanceBlocks,
  blockNumber,
  minerStop,
  minerStart
} = require('../Utils/BSC');

const { makeToken } = require('../Utils/Venus');

const ONE_DAY = 24 * 60 * 60;
const ONE_YEAR = 360 * 24 * 60 * 60;
const TOTAL_PERIODS = 360;
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

describe('XVSVesting', () => {
  let root, alice, bob, redeemerAddress;
  let vrtConversion, vrtConversionAddress,
    vrtToken, vrtTokenAddress,
    xvsToken, xvsTokenAddress;
  let blockTimestamp, delay = 10;
  let conversionRatio, conversionRatioMultiplier, conversionStartTime, vrtDailyLimit, vrtTotalSupply;
  let vrtTransferAmount, vrtFundingAmount;
  let vrtForMint, xvsTokenMintAmount;
  let xvsVesting, xvsVestingAddress;

  beforeEach(async () => {
    [root, alice, bob, vrtConversionAddress, redeemerAddress, ...accounts] = saddle.accounts;
    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
    conversionStartTime = blockTimestamp;
    conversionRatioMultiplier = 0.75;
    conversionRatio = new BigNumber(0.75e18);
    vrtTotalSupply = bnbMantissa(2000000000);

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

    xvsVesting = await deploy('XVSVestingHarness', [xvsTokenAddress]);
    xvsVestingAddress = xvsVesting._address;

    xvsTokenMintAmount = bnbMantissa(100000);
    await send(xvsToken, 'transfer', [vrtConversionAddress, xvsTokenMintAmount], { from: root });
    await send(xvsVesting, '_setVrtConversion', [vrtConversionAddress], { from: root });
  });

  describe("constructor", () => {

    it("sets vrtConversion Address in XVSVesting", async () => {
      let vrtConversionAddressActual = await call(xvsVesting, "vrtConversionAddress");
      expect(vrtConversionAddressActual).toEqual(vrtConversionAddress);
    });

    it("sets XVS Address in XVSVesting", async () => {
      let xvsAddressActual = await call(xvsVesting, "xvsAddress");
      expect(xvsAddressActual).toEqual(xvsTokenAddress);
    });
  });

  describe("Withdraw XVS After Vesting", () => {

    it("Withdraw XVS - After 1st Vesting With a wait of 360 days", async () => {

      const redeemAmount_Vesting_1 = bnbMantissa(100);
      await send(xvsToken, 'transfer', [vrtConversionAddress, redeemAmount_Vesting_1], { from: root });
      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });

      let depositTxn_Vesting_1 = await send(xvsVesting, 'deposit', [redeemerAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });

      const vestingStartBlock_Vesting_1 = await blockNumber();
      const blocknumberAfter_Vesting_1 = vestingStartBlock_Vesting_1;
      const expectedWithdrawalAmount_Vesting_1 =
        calculatedExpectedWithdrawalAmount(redeemAmount_Vesting_1, 0, vestingStartBlock_Vesting_1, blocknumberAfter_Vesting_1);

      expect(depositTxn_Vesting_1).toHaveLog('XVSVested', {
        recipient: redeemerAddress,
        amount: redeemAmount_Vesting_1,
        withdrawnAmount: BigNumber(expectedWithdrawalAmount_Vesting_1),
        vestingStartBlock: vestingStartBlock_Vesting_1
      });

      await send(xvsToken, 'approve', [xvsVestingAddress, redeemAmount_Vesting_1], { from: vrtConversionAddress });

      // Advance by 360 Days
      await advanceBlocks(getBlocksbyDays(360));

      const xvs_balance_of_redeemer_before_withdraw = await call(xvsToken, 'balanceOf', [redeemerAddress]);
      const xvs_balance_of_vestingContract_before_withdraw = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);

      let withdrawTxn_After_Vesting_1 = await send(xvsVesting, 'withdraw', [redeemerAddress], { from: redeemerAddress });

      expect(withdrawTxn_After_Vesting_1).toSucceed();

      const xvs_balance_of_redeemer_after_withdraw = await call(xvsToken, 'balanceOf', [redeemerAddress]);
      const xvs_balance_of_vestingContract_after_withdraw = await call(xvsToken, 'balanceOf', [xvsVestingAddress]);

      expect(new BigNumber(xvs_balance_of_redeemer_after_withdraw)).toEqual
        (new BigNumber(xvs_balance_of_redeemer_before_withdraw).plus(new BigNumber(redeemAmount_Vesting_1)));

      expect(new BigNumber(xvs_balance_of_vestingContract_after_withdraw)).toEqual
        (new BigNumber(xvs_balance_of_vestingContract_before_withdraw).minus(new BigNumber(redeemAmount_Vesting_1)));

      expect(withdrawTxn_After_Vesting_1).toHaveLog('XVSWithdrawn', {
        recipient: redeemerAddress,
        amount: new BigNumber(redeemAmount_Vesting_1)
      });
    });

  });


});
