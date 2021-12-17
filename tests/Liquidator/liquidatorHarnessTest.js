const {
  bnbUnsigned,
  bnbMantissa,
} = require('../Utils/BSC');
const {
  makeVToken,
  setBalance,
} = require('../Utils/Venus');

const repayAmount = bnbUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.mul(4); // forced
const announcedIncentive = bnbMantissa('1.10');
const treasuryPercent = bnbMantissa('0.05');

function calculateSplitSeizedTokens(amount) {
  const treasuryDelta =
    amount
      .mul(bnbMantissa('1')).div(announcedIncentive) // / 1.1
      .mul(treasuryPercent).div(bnbMantissa('1'));   // * 0.05
  const liquidatorDelta = amount.sub(treasuryDelta);
  return { treasuryDelta, liquidatorDelta };
}

describe('Liquidator', function () {
  let root, liquidator, borrower, treasury, accounts;
  let vToken, vTokenCollateral, liquidatorContract, vBnb;

  beforeEach(async () => {
    [root, liquidator, borrower, treasury, ...accounts] = saddle.accounts;
    vToken = await makeVToken({ comptrollerOpts: { kind: 'bool' } });
    vTokenCollateral = await makeVToken({ comptroller: vToken.comptroller });
    vBnb = await makeVToken({ kind: 'vbnb', comptroller: vToken.comptroller });
    liquidatorContract = await deploy(
      'LiquidatorHarness', [
      root,
      vBnb._address,
      vToken.comptroller._address,
      treasury,
      treasuryPercent
    ]
    );
  });

  describe('splitLiquidationIncentive', () => {

    it('split liquidationIncentive between Treasury and Liquidator with correct amounts', async () => {
      const splitResponse = await call(liquidatorContract, 'splitLiquidationIncentive', [seizeTokens]);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(splitResponse["ours"]).toEqual(expectedData.treasuryDelta.toString());
      expect(splitResponse["theirs"]).toEqual(expectedData.liquidatorDelta.toString());
    });
  });

  describe('distributeLiquidationIncentive', () => {
    
    it('distribute the liquidationIncentive between Treasury and Liquidator with correct amounts', async () => {
      await setBalance(vTokenCollateral, liquidatorContract._address, seizeTokens.add(4e5));
      const distributeLiquidationIncentiveResponse = 
      await send(liquidatorContract, 'distributeLiquidationIncentive', [vTokenCollateral._address, seizeTokens]);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(distributeLiquidationIncentiveResponse).toHaveLog('DistributeLiquidationIncentive', {
        seizeTokensForTreasury: expectedData.treasuryDelta.toString(),
        seizeTokensForLiquidator: expectedData.liquidatorDelta.toString()
      });
    });

  });

  describe('Fails to distribute LiquidationIncentive', () => {
    
    it('Insufficient Collateral in LiquidatorContract - Error for transfer to Liquidator', async () => {

      await expect(send(liquidatorContract, 'distributeLiquidationIncentive', [vTokenCollateral._address, seizeTokens]))
      .rejects.toRevert("revert failed to transfer to liquidator");

    });

    it('Insufficient Collateral in LiquidatorContract - Error for transfer to Treasury', async () => {
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      await setBalance(vTokenCollateral, liquidatorContract._address, expectedData.liquidatorDelta);
      await expect(send(liquidatorContract, 'distributeLiquidationIncentive', [vTokenCollateral._address, seizeTokens]))
      .rejects.toRevert("revert failed to transfer to treasury");

    });

  });

});