const {
  bnbBalance,
  bnbGasCost,
  getContract
} = require('./Utils/BSC');

const {
  makeComptroller,
  makeVToken,
  makePriceOracle,
  pretendBorrow,
  borrowSnapshot
} = require('./Utils/Venus');

const {
  beforeEachFixture
} = require('./Utils/Fixture');

describe('Maximillion', () => {
  let root, borrower;
  let maximillion, vBnb;

  const fixture = async () => {
    [root, borrower] = saddle.accounts;
    vBnb = await makeVToken({kind: "vbnb", supportMarket: true});
    maximillion = await deploy('Maximillion', [vBnb._address]);
  }

  beforeEachFixture(fixture);

  describe("constructor", () => {
    it("sets address of vBnb", async () => {
      expect(await call(maximillion, "vBnb")).toEqual(vBnb._address);
    });
  });

  describe("repayBehalf", () => {
    it("refunds the entire amount with no borrows", async () => {
      const beforeBalance = await bnbBalance(root);
      const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
      const gasCost = await bnbGasCost(result);
      const afterBalance = await bnbBalance(root);
      expect(result).toSucceed();
      expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost));
    });

    it("repays part of a borrow", async () => {
      await pretendBorrow(vBnb, borrower, 1, 1, 150);
      const beforeBalance = await bnbBalance(root);
      const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
      const gasCost = await bnbGasCost(result);
      const afterBalance = await bnbBalance(root);
      const afterBorrowSnap = await borrowSnapshot(vBnb, borrower);
      expect(result).toSucceed();
      expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost).sub(100));
      expect(afterBorrowSnap.principal).toEqualNumber(50);
    });

    it("repays a full borrow and refunds the rest", async () => {
      await pretendBorrow(vBnb, borrower, 1, 1, 90);
      const beforeBalance = await bnbBalance(root);
      const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
      const gasCost = await bnbGasCost(result);
      const afterBalance = await bnbBalance(root);
      const afterBorrowSnap = await borrowSnapshot(vBnb, borrower);
      expect(result).toSucceed();
      expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost).sub(90));
      expect(afterBorrowSnap.principal).toEqualNumber(0);
    });
  });
});
