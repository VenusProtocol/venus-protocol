const { bnbMantissa, minerStart, minerStop } = require("./Utils/BSC");

const { makeVToken, balanceOf, borrowSnapshot, enterMarkets, setMarketSupplyCap } = require("./Utils/Venus");

describe("Spinarama", () => {
  let root, from; // eslint-disable-line @typescript-eslint/no-unused-vars

  beforeEach(async () => {
    [root, from] = saddle.accounts;
  });

  describe("#mintMint", () => {
    it("should succeed", async () => {
      const vToken = await makeVToken({ supportMarket: true, underlyingPrice: 1 });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      await send(vToken.underlying, "harnessSetBalance", [from, 100], { from });
      await send(
        vToken.underlying,
        "approve",
        [vToken._address, "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"],
        { from },
      );
      await minerStop();
      const p1 = send(vToken, "mint", [1], { from });
      const p2 = send(vToken, "mint", [2], { from });
      await minerStart();
      expect(await p1).toSucceed();
      expect(await p2).toSucceed();
      expect(await balanceOf(vToken, from)).toEqualNumber(3);
    });

    it("should partial succeed", async () => {
      const vToken = await makeVToken({ supportMarket: true, underlyingPrice: 1 });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      await send(vToken.underlying, "harnessSetBalance", [from, 100], { from });
      await send(vToken.underlying, "approve", [vToken._address, 10], { from });
      await minerStop();
      const p1 = send(vToken, "mint", [11], { from });
      const p2 = send(vToken, "mint", [10], { from });
      await expect(minerStart()).rejects.toRevert("revert Insufficient allowance");
      try {
        await p1;
      } catch (err) {
        // hack: miner start reverts with correct message, but tx gives us a weird tx obj. ganache bug?
        expect(err.toString()).toContain("reverted by the EVM");
      }
      await expect(p2).resolves.toSucceed();
      expect(await balanceOf(vToken, from)).toEqualNumber(10);
    });
  });

  describe("#mintRedeem", () => {
    it("should succeed", async () => {
      const vToken = await makeVToken({ supportMarket: true, underlyingPrice: 1 });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      await send(vToken.underlying, "harnessSetBalance", [from, 100], { from });
      await send(vToken.underlying, "approve", [vToken._address, 10], { from });
      await send(vToken.comptroller.vai, "approve", [vToken.comptroller._address, 100], { from });
      await minerStop();
      const p1 = send(vToken, "mint", [10], { from });
      const p2 = send(vToken, "redeemUnderlying", [10], { from });
      await minerStart();
      expect(await p1).toSucceed();
      expect(await p2).toSucceed();
      expect(await balanceOf(vToken, from)).toEqualNumber(0);
    });
  });

  describe("#redeemMint", () => {
    it("should succeed", async () => {
      const vToken = await makeVToken({ supportMarket: true, underlyingPrice: 1 });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      await send(vToken, "harnessSetTotalSupply", [10]);
      await send(vToken, "harnessSetExchangeRate", [bnbMantissa(1)]);
      await send(vToken, "harnessSetBalance", [from, 10]);
      await send(vToken.underlying, "harnessSetBalance", [vToken._address, 10]);
      await send(vToken.underlying, "approve", [vToken._address, 10], { from });
      await minerStop();
      const p1 = send(vToken, "redeem", [10], { from });
      const p2 = send(vToken, "mint", [10], { from });
      await minerStart();
      expect(await p1).toSucceed();
      expect(await p2).toSucceed();
      expect(await balanceOf(vToken, from)).toEqualNumber(10);
    });
  });

  describe("#repayRepay", () => {
    it("should succeed", async () => {
      const vToken1 = await makeVToken({ supportMarket: true, underlyingPrice: 1, collateralFactor: 0.5 });
      await setMarketSupplyCap(vToken1.comptroller, [vToken1._address], [100000000000]);
      const vToken2 = await makeVToken({ supportMarket: true, underlyingPrice: 1, comptroller: vToken1.comptroller });
      await setMarketSupplyCap(vToken2.comptroller, [vToken2._address], [100000000000]);
      await send(vToken1.underlying, "harnessSetBalance", [from, 10]);
      await send(vToken1.underlying, "approve", [vToken1._address, 10], { from });
      await send(vToken2.underlying, "harnessSetBalance", [vToken2._address, 10]);
      await send(vToken2, "harnessSetTotalSupply", [100]);
      await send(vToken2.underlying, "approve", [vToken2._address, 10], { from });
      await send(vToken2, "harnessSetExchangeRate", [bnbMantissa(1)]);
      await send(vToken1.comptroller.vai, "approve", [vToken1.comptroller._address, 100], { from });
      expect(await enterMarkets([vToken1, vToken2], from)).toSucceed();
      expect(await send(vToken1, "mint", [10], { from })).toSucceed();
      expect(await send(vToken2, "borrow", [2], { from })).toSucceed();
      await minerStop();
      const p1 = send(vToken2, "repayBorrow", [1], { from });
      const p2 = send(vToken2, "repayBorrow", [1], { from });
      await minerStart();
      expect(await p1).toSucceed();
      expect(await p2).toSucceed();
      expect((await borrowSnapshot(vToken2, from)).principal).toEqualNumber(0);
    });

    // XXX not yet converted below this point...moving on to certora

    // it.skip('can have partial failure succeed', async () => {
    //   const {moneyMarketHarness,
    //     priceOracle,
    //     interestRateModel} = await setupMoneyMarket(root);
    //   const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
    //   const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
    //   const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

    //   // Add cash to the protocol
    //   await addCash(moneyMarketHarness, BAT, root);

    //   // Supply some collateral
    //   expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

    //   // Now borrow 5 bat
    //   expect(await spinarama.methods.borrow(BAT._address, 5).send({from: accounts[0]})).toSucceed();

    //   // And repay it, repay it
    //   const {'0': err0, '1': err1} = await spinarama.methods.repayRepay(BAT._address, 100, 1).call({from: accounts[0]});

    //   expect(err0).hasErrorCode(ErrorEnum.INTEGER_UNDERFLOW);
    //   expect(err1).hasErrorCode(ErrorEnum.NO_ERROR);
    // });
  });

  // describe('#borrowRepayBorrow', () => {
  //   it.skip('should fail', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     // Borrow then repayBorrow should revert
  //     await expect(
  //       spinarama.methods.borrowRepayBorrow(BAT._address, 5, 1).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });

  //   it.skip('can succeed with partial failure', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     // Borrow a little, repay a lot
  //     const {'0': err0, '1': err1} = await spinarama.methods.borrowRepayBorrow(BAT._address, 1, 1000).call({from: accounts[0]});

  //     expect(err0).hasErrorCode(ErrorEnum.NO_ERROR);
  //     expect(err1).hasErrorCode(ErrorEnum.INTEGER_UNDERFLOW);
  //   });
  // });

  // describe('#borrowSupply', () => {
  //   it.skip('should fail in same asset', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     // Borrow then supply should revert
  //     await expect(
  //       spinarama.methods.borrowSupply(BAT._address, BAT._address, 5, 1).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });

  //   it.skip('should fail, even in different assets', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     // Borrow then supply in different assets
  //     await expect(
  //       spinarama.methods.borrowSupply(BAT._address, OMG._address, 5, 1).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });
  // });

  // describe('#supplyLiquidate', () => {
  //   it.skip('should fail', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     await expect(
  //       spinarama.methods.supplyLiquidate(OMG._address, 5, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });
  // });

  // describe('#withdrawLiquidate', () => {
  //   it.skip('should fail', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     await expect(
  //       spinarama.methods.withdrawLiquidate(OMG._address, 5, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });
  // });

  // describe('#borrowLiquidate', () => {
  //   it.skip('should fail', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root);
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     await expect(
  //       spinarama.methods.borrowLiquidate(OMG._address, 5, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });
  // });

  // describe('#repayBorrowLiquidate', () => {
  //   it.skip('should fail', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root)
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     // Borrow some OMG
  //     expect(await spinarama.methods.borrow(OMG._address, 5).send({from: accounts[0]})).toSucceed();

  //     await expect(
  //       spinarama.methods.repayBorrowLiquidate(OMG._address, 1, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });
  // });

  // describe('#liquidateLiquidate', () => {
  //   it.skip('should fail', async () => {
  //     const {moneyMarketHarness,
  //       priceOracle,
  //       interestRateModel} = await setupMoneyMarket(root)
  //     const spinarama = await Spinarama.new(moneyMarketHarness._address).send({from: root});
  //     const OMG = await setupSupply(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);
  //     const BAT = await setupBorrow(root, accounts[0], spinarama, moneyMarketHarness, priceOracle, interestRateModel);

  //     // Add cash to the protocol
  //     await addCash(moneyMarketHarness, BAT, root);

  //     // Supply some collateral
  //     expect(await spinarama.methods.supply(OMG._address, 15).send({from: accounts[0]})).toSucceed();

  //     await expect(
  //       spinarama.methods.liquidateLiquidate(OMG._address, 1, accounts[0], OMG._address, BAT._address, 0).call({from: accounts[0]})
  //     ).rejects.toRevert();
  //   });
  // });
});
