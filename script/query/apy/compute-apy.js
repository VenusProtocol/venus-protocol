const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const BigNumber = require("bignumber.js");
const daysPerYear = 365;
const blocksPerDay = 28800;

(async () => {
  const vtokenAddress = contractConfigData.Contracts.vTRX;
  const vtokenContract = await saddle.getContractAt("VBep20Delegate", vtokenAddress);

  const cash = await vtokenContract.methods.getCash().call();

  const borrowRatePerBlock = await vtokenContract.methods.borrowRatePerBlock().call();
  const supplyRatePerBlock = await vtokenContract.methods.supplyRatePerBlock().call();

  const borrowRate = new BigNumber(borrowRatePerBlock).div(1e18).multipliedBy(blocksPerDay).dp(18, 1);
  const borrowApy = new BigNumber(borrowRate)
    .plus(1)
    .pow(daysPerYear - 1)
    .minus(1)
    .multipliedBy(100)
    .dp(18, 1);
  console.log({ borrowApy });
  const supplyRate = new BigNumber(supplyRatePerBlock).div(1e18).multipliedBy(blocksPerDay).dp(18, 1);
  const supplyApy = new BigNumber(supplyRate)
    .plus(1)
    .pow(daysPerYear - 1)
    .minus(1)
    .multipliedBy(100)
    .dp(18, 1);
  console.log({ supplyApy });
  const exchangeRate = await vtokenContract.methods.exchangeRateCurrent().call();

  let underlyingAddress = await vtokenContract.methods.underlying().call();
  underlyingAddress = underlyingAddress.toLowerCase();

  // underlying contract
  const underlyingContract = await saddle.getContractAt("VBep20", underlyingAddress);
  const underlyingDecimal = await underlyingContract.methods.decimals().call();
  const priceOracleContract = {};
  const underlyingPrice = await priceOracleContract.methods.getUnderlyingPrice(vtokenAddress).call();

  const totalSupply = await vtokenContract.methods.totalSupply().call();
  const totalSupplyUsd = new BigNumber(totalSupply)
    .multipliedBy(new BigNumber(exchangeRate))
    .multipliedBy(new BigNumber(underlyingPrice))
    .div(new BigNumber(10).exponentiatedBy(36))
    .div(new BigNumber(10).exponentiatedBy(18))
    .dp(18, 1);
  console.log({ totalSupplyUsd });
  const totalBorrows = await vtokenContract.methods.totalBorrowsCurrent().call();
  const totalBorrowsUsd = new BigNumber(totalBorrows)
    .multipliedBy(new BigNumber(underlyingPrice))
    .div(new BigNumber(10).exponentiatedBy(36))
    .dp(18, 1);
  console.log({ totalBorrowsUsd });
  const _priceDecimal = new BigNumber(10).exponentiatedBy(36 - underlyingDecimal);
  const tokenPrice = new BigNumber(underlyingPrice).div(_priceDecimal);
  const liquidity = new BigNumber(cash)
    .div(new BigNumber(10).pow(underlyingDecimal))
    .multipliedBy(tokenPrice)
    .dp(18, 1);
  console.log({ liquidity });
})();
