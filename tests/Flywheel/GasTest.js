const { makeComptroller, makeVToken } = require("../Utils/Venus");
const { bnbExp, bnbUnsigned } = require("../Utils/BSC");

// NB: coverage doesn't like this
describe.skip("Flywheel trace ops", () => {
  let comptroller, market;
  beforeEach(async () => {
    let interestRateModelOpts = { borrowRate: 0.000001 };
    comptroller = await makeComptroller();
    market = await makeVToken({ comptroller, supportMarket: true, underlyingPrice: 3, interestRateModelOpts });
    await send(comptroller, "_addVenusMarkets", [[market].map(c => c._address)]);
  });

  it("update supply index SSTOREs", async () => {
    await send(comptroller, "setBlockNumber", [100]);
    await send(market, "harnessSetTotalBorrows", [bnbUnsigned(11e18)]);
    await send(comptroller, "setVenusSpeed", [market._address, bnbExp(0.5)]);

    const tx = await send(comptroller, "harnessUpdateVenusSupplyIndex", [market._address]);

    const ops = {};
    await saddle.trace(tx, {
      execLog: log => {
        if (log.lastLog != undefined) {
          ops[log.op] = (ops[log.op] || []).concat(log);
        }
      },
    });
    expect(ops.SSTORE.length).toEqual(1);
  });

  it("update borrow index SSTOREs", async () => {
    await send(comptroller, "setBlockNumber", [100]);
    await send(market, "harnessSetTotalBorrows", [bnbUnsigned(11e18)]);
    await send(comptroller, "setVenusSpeed", [market._address, bnbExp(0.5)]);

    const tx = await send(comptroller, "harnessUpdateVenusBorrowIndex", [market._address, bnbExp(1.1)]);

    const ops = {};
    await saddle.trace(tx, {
      execLog: log => {
        if (log.lastLog != undefined) {
          ops[log.op] = (ops[log.op] || []).concat(log);
        }
      },
    });
    expect(ops.SSTORE.length).toEqual(1);
  });
});
