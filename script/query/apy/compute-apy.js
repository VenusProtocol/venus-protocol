const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const BigNumber = require('bignumber.js');
const daysPerYear = 365;
const blocksPerDay = 28800;

(async () => {  

  const unitrollerAddress = contractConfigData.Contracts.Unitroller;
  const comptrollerContractInstance = await saddle.getContractAt('Comptroller', unitrollerAddress);
  const vtokenAddress = contractConfigData.Contracts.vTRX;
  const vtokenContract = await saddle.getContractAt('VBep20Delegate',vtokenAddress);

  const venusSpeeds = await comptrollerContractInstance.methods.venusSpeeds(vtokenAddress).call();
  const borrowerDailyVenus = new BigNumber(venusSpeeds).multipliedBy(blocksPerDay).toString(10);
  const supplierDailyVenus = borrowerDailyVenus;

  const venusBorrowState = await comptrollerContractInstance.methods.venusBorrowState(vtokenAddress).call();
  const venusBorrowIndex = venusBorrowState.index;

  const venusSupplyState = await comptrollerContractInstance.methods.venusSupplyState(vtokenAddress).call();
  const venusSupplyIndex = venusSupplyState.index;

  const collateralFactorMantissa = await comptrollerContractInstance.methods.markets(vtokenAddress).call();
  const collateralFactor = collateralFactorMantissa[1];

  const vtokenName = await vtokenContract.methods.name().call();
  const vtokenDecimals = await vtokenContract.methods.decimals().call();

  const cash = await vtokenContract.methods.getCash().call();
  const totalReserves = await vtokenContract.methods.totalReserves().call();
  const reserveFactor = await vtokenContract.methods.reserveFactorMantissa().call();

  const borrowRatePerBlock = await vtokenContract.methods.borrowRatePerBlock().call();
  const supplyRatePerBlock = await vtokenContract.methods.supplyRatePerBlock().call();

  const borrowRate = new BigNumber(borrowRatePerBlock).div(1e18).multipliedBy(blocksPerDay).dp(18, 1);
  const borrowApy = new BigNumber(borrowRate).plus(1).pow(daysPerYear - 1).minus(1)
    .multipliedBy(100)
    .dp(18, 1);
  const supplyRate = new BigNumber(supplyRatePerBlock).div(1e18).multipliedBy(blocksPerDay).dp(18, 1);
  const supplyApy = new BigNumber(supplyRate).plus(1).pow(daysPerYear - 1).minus(1)
    .multipliedBy(100)
    .dp(18, 1);

  const exchangeRate = await vtokenContract.methods.exchangeRateCurrent().call();

  underlyingAddress = await vtokenContract.methods.underlying().call();
  underlyingAddress = underlyingAddress.toLowerCase();

  // underlying contract
  const underlyingContract = await saddle.getContractAt('VBep20',underlyingAddress);
  const underlyingSymbol = await underlyingContract.methods.symbol().call();
  const underlyingName = await underlyingContract.methods.name().call();
  const underlyingDecimal = await underlyingContract.methods.decimals().call();
  
  const underlyingPrice = await priceOracleContract.methods.getUnderlyingPrice(vtokenAddress).call();

  const totalSupply = await vtokenContract.methods.totalSupply().call();
  const totalSupply2 = new BigNumber(totalSupply).div(new BigNumber(10).exponentiatedBy(vtokenDecimals));
  const totalSupplyUsd = new BigNumber(totalSupply).multipliedBy(new BigNumber(exchangeRate))
    .multipliedBy(new BigNumber(underlyingPrice))
    .div(new BigNumber(10).exponentiatedBy(36))
    .div(new BigNumber(10).exponentiatedBy(18))
    .dp(18, 1);

  const totalBorrows = await vtokenContract.methods.totalBorrowsCurrent().call();
  const totalBorrows2 = new BigNumber(totalBorrows).div(new BigNumber(10).exponentiatedBy(underlyingDecimal));
  let totalBorrowsUsd = new BigNumber(totalBorrows).multipliedBy(new BigNumber(underlyingPrice))
    .div(new BigNumber(10).exponentiatedBy(36)).dp(18, 1);

  const _priceDecimal = new BigNumber(10).exponentiatedBy(36 - underlyingDecimal);
  const tokenPrice = new BigNumber(underlyingPrice).div(_priceDecimal);
  const liquidity = new BigNumber(cash).div(new BigNumber(10).pow(underlyingDecimal)).multipliedBy(tokenPrice).dp(18, 1);


})();
