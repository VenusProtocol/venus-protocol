const { bnbGasCost, bnbMantissa, bnbUnsigned, sendFallback } = require("../Utils/BSC");

const { makeVToken, fastForward, setBalance, setBNBBalance, getBalances, adjustBalances } = require("../Utils/Venus");

const exchangeRate = 5;
const mintAmount = bnbUnsigned(1e5);
const mintTokens = mintAmount.div(exchangeRate);
const redeemTokens = bnbUnsigned(10e3);
const redeemAmount = redeemTokens.mul(exchangeRate);

async function preMint(vToken, minter, mintAmount, mintTokens, exchangeRate) {
  await send(vToken.comptroller, "setMintAllowed", [true]);
  await send(vToken.comptroller, "setMintVerify", [true]);
  await send(vToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(vToken, "harnessSetExchangeRate", [bnbMantissa(exchangeRate)]);
}

async function mintExplicit(vToken, minter, mintAmount) {
  return send(vToken, "mint", [], { from: minter, value: mintAmount });
}

async function mintFallback(vToken, minter, mintAmount) {
  return sendFallback(vToken, { from: minter, value: mintAmount });
}

async function preRedeem(vToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
  await send(vToken.comptroller, "setRedeemAllowed", [true]);
  await send(vToken.comptroller, "setRedeemVerify", [true]);
  await send(vToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(vToken, "harnessSetExchangeRate", [bnbMantissa(exchangeRate)]);
  await setBNBBalance(vToken, redeemAmount);
  await send(vToken, "harnessSetTotalSupply", [redeemTokens]);
  await setBalance(vToken, redeemer, redeemTokens);
}

async function redeemVTokens(vToken, redeemer, redeemTokens) {
  return send(vToken, "redeem", [redeemTokens], { from: redeemer });
}

async function redeemUnderlying(vToken, redeemer, redeemTokens, redeemAmount) {
  return send(vToken, "redeemUnderlying", [redeemAmount], { from: redeemer });
}

describe("VBNB", () => {
  let root, minter, redeemer; // eslint-disable-line @typescript-eslint/no-unused-vars
  let vToken;

  beforeEach(async () => {
    [root, minter, redeemer] = saddle.accounts; // eslint-disable-line @typescript-eslint/no-unused-vars
    vToken = await makeVToken({ kind: "vbnb", comptrollerOpts: { kind: "bool" } });
    await fastForward(vToken, 1);
  });

  [mintExplicit, mintFallback].forEach(mint => {
    describe(mint.name, () => {
      beforeEach(async () => {
        await preMint(vToken, minter, mintAmount, mintTokens, exchangeRate);
      });

      it("reverts if interest accrual fails", async () => {
        await send(vToken.interestRateModel, "setFailBorrowRate", [true]);
        await expect(mint(vToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns success from mintFresh and mints the correct number of tokens", async () => {
        const beforeBalances = await getBalances([vToken], [minter]);
        const receipt = await mint(vToken, minter, mintAmount);
        const afterBalances = await getBalances([vToken], [minter]);
        expect(receipt).toSucceed();
        expect(mintTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(
          await adjustBalances(beforeBalances, [
            [vToken, "bnb", mintAmount],
            [vToken, "tokens", mintTokens],
            [vToken, minter, "bnb", -mintAmount.add(await bnbGasCost(receipt))],
            [vToken, minter, "tokens", mintTokens],
          ]),
        );
      });
    });
  });

  [redeemVTokens, redeemUnderlying].forEach(redeem => {
    describe(redeem.name, () => {
      beforeEach(async () => {
        await preRedeem(vToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("emits a redeem failure if interest accrual fails", async () => {
        await send(vToken.interestRateModel, "setFailBorrowRate", [true]);
        await expect(redeem(vToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert(
          "revert INTEREST_RATE_MODEL_ERROR",
        );
      });

      it("returns error from redeemFresh without emitting any extra logs", async () => {
        expect(await redeem(vToken, redeemer, redeemTokens.mul(5), redeemAmount.mul(5))).toHaveTokenFailure(
          "MATH_ERROR",
          "REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED",
        );
      });

      it("returns success from redeemFresh and redeems the correct amount", async () => {
        await fastForward(vToken);
        const beforeBalances = await getBalances([vToken], [redeemer]);
        const receipt = await redeem(vToken, redeemer, redeemTokens, redeemAmount);
        expect(receipt).toTokenSucceed();
        const afterBalances = await getBalances([vToken], [redeemer]);
        expect(redeemTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(
          await adjustBalances(beforeBalances, [
            [vToken, "bnb", -redeemAmount],
            [vToken, "tokens", -redeemTokens],
            [vToken, redeemer, "bnb", redeemAmount.sub(await bnbGasCost(receipt))],
            [vToken, redeemer, "tokens", -redeemTokens],
          ]),
        );
      });
    });
  });
});
