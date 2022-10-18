const { bnbUnsigned, bnbMantissa } = require("../Utils/BSC");

const {
  makeVToken,
  balanceOf,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  preApprove,
  quickMint,
  preSupply,
  quickRedeem,
  quickRedeemUnderlying,
} = require("../Utils/Venus");

const exchangeRate = 50e3;
const mintAmount = bnbUnsigned(10e4);
const mintTokens = mintAmount.div(exchangeRate);
const redeemTokens = bnbUnsigned(10e3);
const redeemAmount = redeemTokens.mul(exchangeRate);
const redeemedAmount = redeemAmount.mul(bnbUnsigned(9999e14)).div(bnbUnsigned(1e18));
const feeAmount = redeemAmount.mul(bnbUnsigned(1e14)).div(bnbUnsigned(1e18));

async function preMint(vToken, minter, mintAmount, mintTokens, exchangeRate) {
  await preApprove(vToken, minter, mintAmount);
  await send(vToken.comptroller, "setMintAllowed", [true]);
  await send(vToken.comptroller, "setMintVerify", [true]);
  await send(vToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(vToken.underlying, "harnessSetFailTransferFromAddress", [minter, false]);
  await send(vToken, "harnessSetBalance", [minter, 0]);
  await send(vToken, "harnessSetExchangeRate", [bnbMantissa(exchangeRate)]);
}

async function mintFresh(vToken, minter, mintAmount) {
  return send(vToken, "harnessMintFresh", [minter, mintAmount]);
}

async function preRedeem(vToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
  await preSupply(vToken, redeemer, redeemTokens);
  await send(vToken.comptroller, "setRedeemAllowed", [true]);
  await send(vToken.comptroller, "setRedeemVerify", [true]);
  await send(vToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(vToken.underlying, "harnessSetBalance", [vToken._address, redeemAmount]);
  await send(vToken.underlying, "harnessSetBalance", [redeemer, 0]);
  await send(vToken.underlying, "harnessSetFailTransferToAddress", [redeemer, false]);
  await send(vToken, "harnessSetExchangeRate", [bnbMantissa(exchangeRate)]);
}

async function redeemFreshTokens(vToken, redeemer, redeemTokens) {
  return send(vToken, "harnessRedeemFresh", [redeemer, redeemTokens, 0]);
}

async function redeemFreshAmount(vToken, redeemer, redeemTokens, redeemAmount) {
  return send(vToken, "harnessRedeemFresh", [redeemer, 0, redeemAmount]);
}

describe("VToken", function () {
  let root, minter, redeemer, user1, devFee; // eslint-disable-line @typescript-eslint/no-unused-vars
  let vToken;
  beforeEach(async () => {
    [root, minter, redeemer, user1, devFee] = saddle.accounts;
    vToken = await makeVToken({ comptrollerOpts: { kind: "boolFee" }, exchangeRate });
  });

  describe("mintFresh", () => {
    beforeEach(async () => {
      await preMint(vToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("fails if comptroller tells it to", async () => {
      await send(vToken.comptroller, "setMintAllowed", [false]);
      expect(await mintFresh(vToken, minter, mintAmount)).toHaveTrollReject("MINT_COMPTROLLER_REJECTION", "MATH_ERROR");
    });

    it("proceeds if comptroller tells it to", async () => {
      await expect(await mintFresh(vToken, minter, mintAmount)).toSucceed();
    });

    it("fails if not fresh", async () => {
      await fastForward(vToken);
      expect(await mintFresh(vToken, minter, mintAmount)).toHaveTokenFailure(
        "MARKET_NOT_FRESH",
        "MINT_FRESHNESS_CHECK",
      );
    });

    it("continues if fresh", async () => {
      await expect(await send(vToken, "accrueInterest")).toSucceed();
      expect(await mintFresh(vToken, minter, mintAmount)).toSucceed();
    });

    it("fails if insufficient approval", async () => {
      expect(await send(vToken.underlying, "approve", [vToken._address, 1], { from: minter })).toSucceed();
      await expect(mintFresh(vToken, minter, mintAmount)).rejects.toRevert("revert Insufficient allowance");
    });

    it("fails if insufficient balance", async () => {
      await setBalance(vToken.underlying, minter, 1);
      await expect(mintFresh(vToken, minter, mintAmount)).rejects.toRevert("revert Insufficient balance");
    });

    it("proceeds if sufficient approval and balance", async () => {
      expect(await mintFresh(vToken, minter, mintAmount)).toSucceed();
    });

    it("fails if exchange calculation fails", async () => {
      expect(await send(vToken, "harnessSetExchangeRate", [0])).toSucceed();
      await expect(mintFresh(vToken, minter, mintAmount)).rejects.toRevert("revert MINT_EXCHANGE_CALCULATION_FAILED");
    });

    it("fails if transferring in fails", async () => {
      await send(vToken.underlying, "harnessSetFailTransferFromAddress", [minter, true]);
      await expect(mintFresh(vToken, minter, mintAmount)).rejects.toRevert("revert TOKEN_TRANSFER_IN_FAILED");
    });

    it("transfers the underlying cash, tokens, and emits Mint, Transfer events", async () => {
      const beforeBalances = await getBalances([vToken], [minter]);
      const result = await mintFresh(vToken, minter, mintAmount);
      const afterBalances = await getBalances([vToken], [minter]);
      expect(result).toSucceed();
      expect(result).toHaveLog("Mint", {
        minter,
        mintAmount: mintAmount.toString(),
        mintTokens: mintTokens.toString(),
      });
      expect(result).toHaveLog(["Transfer", 1], {
        from: vToken._address,
        to: minter,
        amount: mintTokens.toString(),
      });
      expect(afterBalances).toEqual(
        await adjustBalances(beforeBalances, [
          [vToken, minter, "cash", -mintAmount],
          [vToken, minter, "tokens", mintTokens],
          [vToken, "cash", mintAmount],
          [vToken, "tokens", mintTokens],
        ]),
      );
    });
  });

  describe("mint", () => {
    beforeEach(async () => {
      await preMint(vToken, minter, mintAmount, mintTokens, exchangeRate);
    });

    it("emits a mint failure if interest accrual fails", async () => {
      await send(vToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(quickMint(vToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from mintFresh without emitting any extra logs", async () => {
      await send(vToken.underlying, "harnessSetBalance", [minter, 1]);
      await expect(mintFresh(vToken, minter, mintAmount)).rejects.toRevert("revert Insufficient balance");
    });

    it("returns success from mintFresh and mints the correct number of tokens", async () => {
      expect(await quickMint(vToken, minter, mintAmount)).toSucceed();
      expect(mintTokens).not.toEqualNumber(0);
      expect(await balanceOf(vToken, minter)).toEqualNumber(mintTokens);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(vToken, minter, mintAmount)).toHaveLog("AccrueInterest", {
        borrowIndex: "1000000000000000000",
        cashPrior: "0",
        interestAccumulated: "0",
        totalBorrows: "0",
      });
    });
  });

  [redeemFreshTokens, redeemFreshAmount].forEach(redeemFresh => {
    describe(redeemFresh.name, () => {
      beforeEach(async () => {
        await preRedeem(vToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("fails if comptroller tells it to", async () => {
        await send(vToken.comptroller, "setRedeemAllowed", [false]);
        expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTrollReject(
          "REDEEM_COMPTROLLER_REJECTION",
        );
      });

      it("fails if not fresh", async () => {
        await fastForward(vToken);
        expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure(
          "MARKET_NOT_FRESH",
          "REDEEM_FRESHNESS_CHECK",
        );
      });

      it("continues if fresh", async () => {
        await expect(await send(vToken, "accrueInterest")).toSucceed();
        expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toSucceed();
      });

      it("fails if insufficient protocol cash to transfer out", async () => {
        await send(vToken.underlying, "harnessSetBalance", [vToken._address, 1]);
        expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure(
          "TOKEN_INSUFFICIENT_CASH",
          "REDEEM_TRANSFER_OUT_NOT_POSSIBLE",
        );
      });

      it("fails if exchange calculation fails", async () => {
        if (redeemFresh == redeemFreshTokens) {
          expect(
            await send(vToken, "harnessSetExchangeRate", [
              "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
            ]),
          ).toSucceed();
          expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure(
            "MATH_ERROR",
            "REDEEM_EXCHANGE_TOKENS_CALCULATION_FAILED",
          );
        } else {
          expect(await send(vToken, "harnessSetExchangeRate", [0])).toSucceed();
          expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure(
            "MATH_ERROR",
            "REDEEM_EXCHANGE_AMOUNT_CALCULATION_FAILED",
          );
        }
      });

      it("fails if transferring out fails", async () => {
        await send(vToken.underlying, "harnessSetFailTransferToAddress", [redeemer, true]);
        await expect(redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert(
          "revert TOKEN_TRANSFER_OUT_FAILED",
        );
      });

      it("fails if total supply < redemption amount", async () => {
        await send(vToken, "harnessExchangeRateDetails", [0, 0, 0]);
        expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure(
          "MATH_ERROR",
          "REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED",
        );
      });

      it("reverts if new account balance underflows", async () => {
        await send(vToken, "harnessSetBalance", [redeemer, 0]);
        expect(await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount)).toHaveTokenFailure(
          "MATH_ERROR",
          "REDEEM_NEW_ACCOUNT_BALANCE_CALCULATION_FAILED",
        );
      });

      it("transfers the underlying cash, tokens, and emits Redeem, Transfer events", async () => {
        const beforeBalances = await getBalances([vToken], [redeemer]);
        const result = await redeemFresh(vToken, redeemer, redeemTokens, redeemAmount);
        const afterBalances = await getBalances([vToken], [redeemer]);
        expect(result).toSucceed();
        expect(result).toHaveLog("Redeem", {
          redeemer,
          redeemAmount: redeemedAmount.toString(),
          redeemTokens: redeemTokens.toString(),
        });
        expect(result).toHaveLog("RedeemFee", {
          redeemer,
          feeAmount: feeAmount.toString(),
          redeemTokens: redeemTokens.toString(),
        });
        expect(result).toHaveLog(["Transfer", 2], {
          from: redeemer,
          to: vToken._address,
          amount: redeemTokens.toString(),
        });
        expect(afterBalances).toEqual(
          await adjustBalances(beforeBalances, [
            [vToken, redeemer, "cash", redeemedAmount],
            [vToken, redeemer, "tokens", -redeemTokens],
            [vToken, "cash", -redeemAmount],
            [vToken, "tokens", -redeemTokens],
          ]),
        );
      });
    });
  });

  describe("redeem", () => {
    beforeEach(async () => {
      await preRedeem(vToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
    });

    it("emits a redeem failure if interest accrual fails", async () => {
      await send(vToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(quickRedeem(vToken, redeemer, redeemTokens)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from redeemFresh without emitting any extra logs", async () => {
      await setBalance(vToken.underlying, vToken._address, 0);
      expect(await quickRedeem(vToken, redeemer, redeemTokens, { exchangeRate })).toHaveTokenFailure(
        "TOKEN_INSUFFICIENT_CASH",
        "REDEEM_TRANSFER_OUT_NOT_POSSIBLE",
      );
    });

    it("returns success from redeemFresh and redeems the right amount", async () => {
      expect(await send(vToken.underlying, "harnessSetBalance", [vToken._address, redeemAmount])).toSucceed();
      expect(await quickRedeem(vToken, redeemer, redeemTokens, { exchangeRate })).toSucceed();
      expect(redeemAmount).not.toEqualNumber(0);
      expect(await balanceOf(vToken.underlying, redeemer)).toEqualNumber(redeemedAmount);
    });

    it("returns success from redeemFresh and redeems the right amount of underlying", async () => {
      expect(await send(vToken.underlying, "harnessSetBalance", [vToken._address, redeemAmount])).toSucceed();
      expect(await quickRedeemUnderlying(vToken, redeemer, redeemAmount, { exchangeRate })).toSucceed();
      expect(redeemAmount).not.toEqualNumber(0);
      expect(await balanceOf(vToken.underlying, redeemer)).toEqualNumber(redeemedAmount);
      expect(await balanceOf(vToken.underlying, devFee)).toEqualNumber(feeAmount);
    });

    it("emits an AccrueInterest event", async () => {
      expect(await quickMint(vToken, minter, mintAmount)).toHaveLog("AccrueInterest", {
        borrowIndex: "1000000000000000000",
        cashPrior: "500000000",
        interestAccumulated: "0",
        totalBorrows: "0",
      });
    });
  });
});
