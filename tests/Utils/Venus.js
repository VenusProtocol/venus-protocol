"use strict";

const { dfn } = require("./JS");
const { encodeParameters, bnbBalance, bnbMantissa, bnbUnsigned, mergeInterface } = require("./BSC");

async function makeComptroller(opts = {}) {
  const {
    root = saddle.account,
    treasuryGuardian = saddle.accounts[4],
    treasuryAddress = saddle.accounts[4],
    kind = "unitroller",
  } = opts || {};

  if (kind == "bool") {
    const comptroller = await deploy("BoolComptroller");

    const xvs = opts.xvs || (await deploy("XVS", [opts.venusOwner || root]));
    const vai = opts.vai || (await makeVAI());

    const vaiunitroller = await deploy("VAIUnitroller");
    const vaicontroller = await deploy("VAIControllerHarness");

    await send(vaiunitroller, "_setPendingImplementation", [vaicontroller._address]);
    await send(vaicontroller, "_become", [vaiunitroller._address]);
    mergeInterface(vaiunitroller, vaicontroller);

    await send(vaiunitroller, "_setComptroller", [comptroller._address]);
    await send(vaiunitroller, "setVAIAddress", [vai._address]);
    await send(vaiunitroller, "initialize");
    await send(vai, "rely", [vaiunitroller._address]);

    //await send(unitroller, '_setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);

    return Object.assign(comptroller, { xvs, vai, vaicontroller: vaiunitroller });
  }

  if (kind == "boolFee") {
    const comptroller = await deploy("BoolComptroller");
    await send(comptroller, "setTreasuryData", [treasuryGuardian, treasuryAddress, 1e14]);
    return comptroller;
  }

  if (kind == "false-marker") {
    return await deploy("FalseMarkerMethodComptroller");
  }

  if (kind == "v1-no-proxy") {
    const comptrollerLens = await deploy("ComptrollerLens");
    const comptroller = await deploy("ComptrollerHarness");
    const priceOracle = opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const closeFactor = bnbMantissa(dfn(opts.closeFactor, 0.051));

    await send(comptroller, "_setCloseFactor", [closeFactor]);
    await send(comptroller, "_setPriceOracle", [priceOracle._address]);
    await send(comptroller, "_setComptrollerLens", [comptrollerLens._address]);

    return Object.assign(comptroller, { priceOracle });
  }

  if (kind == "unitroller-g2") {
    const unitroller = opts.unitroller || (await deploy("Unitroller"));
    const comptroller = await deploy("ComptrollerScenarioG2");
    const priceOracle = opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const closeFactor = bnbMantissa(dfn(opts.closeFactor, 0.051));
    const liquidationIncentive = bnbMantissa(1);
    const xvs = opts.xvs || (await deploy("XVS", [opts.compOwner || root]));
    const venusRate = bnbUnsigned(dfn(opts.venusRate, 1e18));

    await send(unitroller, "_setPendingImplementation", [comptroller._address]);
    await send(comptroller, "_become", [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, "_setLiquidationIncentive", [liquidationIncentive]);
    await send(unitroller, "_setCloseFactor", [closeFactor]);
    await send(unitroller, "_setPriceOracle", [priceOracle._address]);
    await send(unitroller, "harnessSetVenusRate", [venusRate]);
    await send(unitroller, "setXVSAddress", [xvs._address]); // harness only

    return Object.assign(unitroller, { priceOracle, xvs });
  }

  if (kind == "unitroller") {
    const comptrollerLens = await deploy("ComptrollerLens");
    const unitroller = opts.unitroller || (await deploy("Unitroller"));
    const comptroller = await deploy("ComptrollerHarness");
    const priceOracle = opts.priceOracle || (await makePriceOracle(opts.priceOracleOpts));
    const closeFactor = bnbMantissa(dfn(opts.closeFactor, 0.051));
    const liquidationIncentive = bnbMantissa(1);
    const xvs = opts.xvs || (await deploy("XVS", [opts.venusOwner || root]));
    const vai = opts.vai || (await makeVAI());
    const venusRate = bnbUnsigned(dfn(opts.venusRate, 1e18));

    await send(unitroller, "_setPendingImplementation", [comptroller._address]);
    await send(comptroller, "_become", [unitroller._address]);
    mergeInterface(unitroller, comptroller);

    const vaiunitroller = await deploy("VAIUnitroller");
    const vaicontroller = await deploy("VAIControllerHarness");

    await send(vaiunitroller, "_setPendingImplementation", [vaicontroller._address]);
    await send(vaicontroller, "_become", [vaiunitroller._address]);
    mergeInterface(vaiunitroller, vaicontroller);

    await send(unitroller, "_setVAIController", [vaiunitroller._address]);
    await send(vaiunitroller, "_setComptroller", [unitroller._address]);
    await send(unitroller, "_setLiquidationIncentive", [liquidationIncentive]);
    await send(unitroller, "_setCloseFactor", [closeFactor]);
    await send(unitroller, "_setPriceOracle", [priceOracle._address]);
    await send(unitroller, "_setComptrollerLens", [comptrollerLens._address]);
    await send(unitroller, "setXVSAddress", [xvs._address]); // harness only
    await send(vaiunitroller, "setVAIAddress", [vai._address]); // harness only
    await send(unitroller, "harnessSetVenusRate", [venusRate]);
    await send(vaiunitroller, "initialize");
    await send(vai, "rely", [vaiunitroller._address]);

    await send(unitroller, "_setTreasuryData", [treasuryGuardian, treasuryAddress, 1e14]);

    return Object.assign(unitroller, { priceOracle, xvs, vai, vaiunitroller });
  }
}

async function makeVToken(opts = {}) {
  const { root = saddle.account, kind = "vbep20" } = opts || {};
  const comptroller = opts.comptroller || (await makeComptroller(opts.comptrollerOpts));
  const interestRateModel = opts.interestRateModel || (await makeInterestRateModel(opts.interestRateModelOpts));
  const exchangeRate = bnbMantissa(dfn(opts.exchangeRate, 1));
  const decimals = bnbUnsigned(dfn(opts.decimals, 8));
  const symbol = opts.symbol || (kind === "vbnb" ? "vBNB" : "vOMG");
  const name = opts.name || `VToken ${symbol}`;
  const admin = opts.admin || root;

  let vToken, underlying;
  let vDelegator, vDelegatee, vDaiMaker;

  switch (kind) {
    case "vbnb":
      vToken = await deploy("VBNBHarness", [
        comptroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
      ]);
      break;

    case "vdai":
      vDaiMaker = await deploy("VDaiDelegateMakerHarness");
      underlying = vDaiMaker;
      vDelegatee = await deploy("VDaiDelegateHarness");
      vDelegator = await deploy("VBep20Delegator", [
        underlying._address,
        comptroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        vDelegatee._address,
        encodeParameters(["address", "address"], [vDaiMaker._address, vDaiMaker._address]),
      ]);
      vToken = await saddle.getContractAt("VDaiDelegateHarness", vDelegator._address);
      break;

    case "vxvs":
      underlying = await deploy("XVS", [opts.compHolder || root]);
      vDelegatee = await deploy("VXvsLikeDelegate");
      vDelegator = await deploy("VBep20Delegator", [
        underlying._address,
        comptroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        vDelegatee._address,
        "0x0",
      ]);
      vToken = await saddle.getContractAt("VXvsLikeDelegate", vDelegator._address);
      break;

    case "vbep20":
    default:
      underlying = opts.underlying || (await makeToken(opts.underlyingOpts));
      vDelegatee = await deploy("VBep20DelegateHarness");
      vDelegator = await deploy("VBep20Delegator", [
        underlying._address,
        comptroller._address,
        interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        admin,
        vDelegatee._address,
        "0x0",
      ]);
      vToken = await saddle.getContractAt("VBep20DelegateHarness", vDelegator._address);
      break;
  }

  if (opts.supportMarket) {
    await send(comptroller, "_supportMarket", [vToken._address]);
  }

  if (opts.addVenusMarket) {
    await send(comptroller, "_addVenusMarket", [vToken._address]);
  }

  if (opts.underlyingPrice) {
    const price = bnbMantissa(opts.underlyingPrice);
    await send(comptroller.priceOracle, "setUnderlyingPrice", [vToken._address, price]);
  }

  if (opts.collateralFactor) {
    const factor = bnbMantissa(opts.collateralFactor);
    expect(await send(comptroller, "_setCollateralFactor", [vToken._address, factor])).toSucceed();
  }

  return Object.assign(vToken, { name, symbol, underlying, comptroller, interestRateModel });
}

async function makeVAI(opts = {}) {
  const { chainId = 97 } = opts || {};

  let vai;

  vai = await deploy("VAIScenario", [chainId]);

  return Object.assign(vai);
}

async function makeInterestRateModel(opts = {}) {
  const { kind = "harnessed" } = opts || {};

  if (kind == "harnessed") {
    const borrowRate = bnbMantissa(dfn(opts.borrowRate, 0));
    return await deploy("InterestRateModelHarness", [borrowRate]);
  }

  if (kind == "false-marker") {
    const borrowRate = bnbMantissa(dfn(opts.borrowRate, 0));
    return await deploy("FalseMarkerMethodInterestRateModel", [borrowRate]);
  }

  if (kind == "white-paper") {
    const baseRate = bnbMantissa(dfn(opts.baseRate, 0));
    const multiplier = bnbMantissa(dfn(opts.multiplier, 1e-18));
    return await deploy("WhitePaperInterestRateModel", [baseRate, multiplier]);
  }

  if (kind == "jump-rate") {
    const baseRate = bnbMantissa(dfn(opts.baseRate, 0));
    const multiplier = bnbMantissa(dfn(opts.multiplier, 1e-18));
    const jump = bnbMantissa(dfn(opts.jump, 0));
    const kink = bnbMantissa(dfn(opts.kink, 0));
    return await deploy("JumpRateModel", [baseRate, multiplier, jump, kink]);
  }
}

async function makePriceOracle(opts = {}) {
  const { kind = "simple" } = opts || {};

  if (kind == "simple") {
    return await deploy("SimplePriceOracle");
  }
}

async function makeChainlinkOracle(opts = {}) {
  return await deploy("MockV3Aggregator", [opts.decimals, opts.initialAnswer]);
}

async function makeToken(opts = {}) {
  const { kind = "bep20" } = opts || {};

  if (kind == "bep20") {
    const quantity = bnbUnsigned(dfn(opts.quantity, 1e25));
    const decimals = bnbUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || "OMG";
    const name = opts.name || `Bep20 ${symbol}`;
    return await deploy("BEP20Harness", [quantity, name, decimals, symbol]);
  }
}

async function balanceOf(token, account) {
  return bnbUnsigned(await call(token, "balanceOf", [account]));
}

async function totalSupply(token) {
  return bnbUnsigned(await call(token, "totalSupply"));
}

async function borrowSnapshot(vToken, account) {
  const { principal, interestIndex } = await call(vToken, "harnessAccountBorrows", [account]);
  return { principal: bnbUnsigned(principal), interestIndex: bnbUnsigned(interestIndex) };
}

async function totalBorrows(vToken) {
  return bnbUnsigned(await call(vToken, "totalBorrows"));
}

async function totalReserves(vToken) {
  return bnbUnsigned(await call(vToken, "totalReserves"));
}

async function enterMarkets(vTokens, from) {
  return await send(vTokens[0].comptroller, "enterMarkets", [vTokens.map(c => c._address)], { from });
}

async function fastForward(vToken, blocks = 5) {
  return await send(vToken, "harnessFastForward", [blocks]);
}

async function setBalance(vToken, account, balance) {
  return await send(vToken, "harnessSetBalance", [account, balance]);
}

async function setMintedVAIOf(comptroller, account, balance) {
  return await send(comptroller, "harnessSetMintedVAIOf", [account, balance]);
}

async function setVAIBalance(vai, account, balance) {
  return await send(vai, "harnessSetBalanceOf", [account, balance]);
}

async function setBNBBalance(vBnb, balance) {
  const current = await bnbBalance(vBnb._address);
  const root = saddle.account;
  expect(await send(vBnb, "harnessDoTransferOut", [root, current])).toSucceed();
  expect(await send(vBnb, "harnessDoTransferIn", [root, balance], { value: balance })).toSucceed();
}

async function getBalances(vTokens, accounts) {
  const balances = {};
  for (let vToken of vTokens) {
    const vBalances = (balances[vToken._address] = {});
    for (let account of accounts) {
      vBalances[account] = {
        bnb: await bnbBalance(account),
        cash: vToken.underlying && (await balanceOf(vToken.underlying, account)),
        tokens: await balanceOf(vToken, account),
        borrows: (await borrowSnapshot(vToken, account)).principal,
      };
    }
    vBalances[vToken._address] = {
      bnb: await bnbBalance(vToken._address),
      cash: vToken.underlying && (await balanceOf(vToken.underlying, vToken._address)),
      tokens: await totalSupply(vToken),
      borrows: await totalBorrows(vToken),
      reserves: await totalReserves(vToken),
    };
  }
  return balances;
}

async function getBalancesWithVAI(vai, vTokens, accounts) {
  const balances = {};
  for (let vToken of vTokens) {
    const vBalances = (balances[vToken._address] = {});
    const vaiBalancesData = (balances[vai._address] = {});
    for (let account of accounts) {
      vBalances[account] = {
        bnb: await bnbBalance(account),
        cash: vToken.underlying && (await balanceOf(vToken.underlying, account)),
        tokens: await balanceOf(vToken, account),
        borrows: (await borrowSnapshot(vToken, account)).principal,
      };
      vaiBalancesData[account] = {
        vai: await balanceOf(vai, account),
      };
    }
    vBalances[vToken._address] = {
      bnb: await bnbBalance(vToken._address),
      cash: vToken.underlying && (await balanceOf(vToken.underlying, vToken._address)),
      tokens: await totalSupply(vToken),
      borrows: await totalBorrows(vToken),
      reserves: await totalReserves(vToken),
    };
  }
  return balances;
}

async function adjustBalances(balances, deltas) {
  for (let delta of deltas) {
    let vToken, account, key, diff;
    if (delta.length == 4) {
      [vToken, account, key, diff] = delta;
    } else {
      [vToken, key, diff] = delta;
      account = vToken._address;
    }
    balances[vToken._address][account][key] = balances[vToken._address][account][key].add(diff);
  }
  return balances;
}

async function adjustBalancesWithVAI(balances, deltas, vai) {
  for (let delta of deltas) {
    let vToken, account, key, diff;
    if (delta[0]._address != vai._address) {
      if (delta.length == 4) {
        [vToken, account, key, diff] = delta;
      } else {
        [vToken, key, diff] = delta;
        account = vToken._address;
      }
      balances[vToken._address][account][key] = balances[vToken._address][account][key].add(diff);
    } else {
      [vToken, account, key, diff] = delta;
      balances[vai._address][account][key] = balances[vai._address][account][key].add(diff);
    }
  }
  return balances;
}

async function preApprove(vToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(vToken.underlying, "harnessSetBalance", [from, amount], { from })).toSucceed();
  }

  return send(vToken.underlying, "approve", [vToken._address, amount], { from });
}

async function preApproveVAI(comptroller, vai, from, to, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(vai, "harnessSetBalanceOf", [from, amount], { from })).toSucceed();
    await send(comptroller, "harnessSetMintedVAIOf", [from, amount]);
  }

  return send(vai, "approve", [to, amount], { from });
}

async function quickMint(vToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(vToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(vToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(vToken, "harnessSetExchangeRate", [bnbMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(vToken, "mint", [mintAmount], { from: minter });
}

async function quickMintVAI(comptroller, vai, vaiMinter, vaiMintAmount) {
  // make sure to accrue interest
  await fastForward(vai, 1);

  expect(await send(vai, "harnessSetBalanceOf", [vaiMinter, vaiMintAmount], { vaiMinter })).toSucceed();
  expect(await send(comptroller, "harnessSetMintedVAIs", [vaiMinter, vaiMintAmount], { vaiMinter })).toSucceed();
  expect(await send(vai, "harnessIncrementTotalSupply", [vaiMintAmount], { vaiMinter })).toSucceed();
}

async function preSupply(vToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(vToken, "harnessSetTotalSupply", [tokens])).toSucceed();
  }
  return send(vToken, "harnessSetBalance", [account, tokens]);
}

async function quickRedeem(vToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(vToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(vToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(vToken, "harnessSetExchangeRate", [bnbMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(vToken, "redeem", [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(vToken, redeemer, redeemAmount, opts = {}) {
  await fastForward(vToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(await send(vToken, "harnessSetExchangeRate", [bnbMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(vToken, "redeemUnderlying", [redeemAmount], { from: redeemer });
}

async function setOraclePrice(vToken, price) {
  return send(vToken.comptroller.priceOracle, "setUnderlyingPrice", [vToken._address, bnbMantissa(price)]);
}

async function setOraclePriceFromMantissa(vToken, price) {
  return send(vToken.comptroller.priceOracle, "setUnderlyingPrice", [vToken._address, price]);
}

async function setBorrowRate(vToken, rate) {
  return send(vToken.interestRateModel, "setBorrowRate", [bnbMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
  return call(interestRateModel, "getBorrowRate", [cash, borrows, reserves].map(bnbUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
  return call(interestRateModel, "getSupplyRate", [cash, borrows, reserves, reserveFactor].map(bnbUnsigned));
}

async function pretendBorrow(vToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await send(vToken, "harnessSetTotalBorrows", [bnbUnsigned(principalRaw)]);
  await send(vToken, "harnessSetAccountBorrows", [borrower, bnbUnsigned(principalRaw), bnbMantissa(accountIndex)]);
  await send(vToken, "harnessSetBorrowIndex", [bnbMantissa(marketIndex)]);
  await send(vToken, "harnessSetAccrualBlockNumber", [bnbUnsigned(blockNumber)]);
  await send(vToken, "harnessSetBlockNumber", [bnbUnsigned(blockNumber)]);
}

async function pretendVAIMint(
  comptroller,
  vaicontroller,
  vai,
  vaiMinter,
  principalRaw,
  totalSupply,
  blockNumber = 2e7,
) {
  await send(comptroller, "harnessSetMintedVAIOf", [vaiMinter, bnbUnsigned(principalRaw)]);
  await send(vai, "harnessIncrementTotalSupply", [bnbUnsigned(principalRaw)]);
  await send(vai, "harnessSetBalanceOf", [vaiMinter, bnbUnsigned(principalRaw)]);
  await send(vaicontroller, "harnessSetBlockNumber", [bnbUnsigned(blockNumber)]);
}

async function setMarketSupplyCap(comptroller, vTokens, supplyCaps) {
  await send(comptroller, "_setMarketSupplyCaps", [vTokens, supplyCaps]);
}

module.exports = {
  makeComptroller,
  makeVToken,
  makeVAI,
  makeInterestRateModel,
  makePriceOracle,
  makeChainlinkOracle,
  makeToken,

  balanceOf,
  totalSupply,
  borrowSnapshot,
  totalBorrows,
  totalReserves,
  enterMarkets,
  fastForward,
  setBalance,
  setMintedVAIOf,
  setVAIBalance,
  setBNBBalance,
  getBalances,
  getBalancesWithVAI,
  adjustBalances,
  adjustBalancesWithVAI,

  preApprove,
  preApproveVAI,
  quickMint,
  quickMintVAI,

  preSupply,
  quickRedeem,
  quickRedeemUnderlying,

  setOraclePrice,
  setOraclePriceFromMantissa,
  setBorrowRate,
  getBorrowRate,
  getSupplyRate,
  pretendBorrow,
  pretendVAIMint,
  setMarketSupplyCap,
};
