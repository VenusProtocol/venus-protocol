// npx hardhat run script/hardhat/simulations/treasuryWithdraw.js

const { expect, web3 } = require("hardhat");
const BigNumber = require("bignumber.js");
const { getContractAt, impersonate, setBalance, IMPERSONATION_STARTING_BALANCE } = require("../utils/misc");

async function treasuryWithdraw() {
  const guy = "0xFEA1c651A47FE29dB9b1bf3cC1f224d8D9CFF68C";
  const timelock = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
  const treasury = "0xf322942f644a996a617bd29c16bd7d231d9f35e9";

  const usdt = "0x55d398326f99059ff775485246999027b3197955";
  const xvs = "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63";

  await impersonate(timelock);
  await impersonate(guy);

  const treasuryContract = getContractAt("VTreasury", treasury);
  const usdtToken = getContractAt("VToken", usdt);
  const xvsToken = getContractAt("VToken", xvs);

  const bnbBalance = new BigNumber(1).times(1e18);
  const usdtBalance = new BigNumber(1000).times(1e18);
  const xvsBalance = new BigNumber(666).times(1e18);

  console.log(`start withdrawing 1000 USDT from treasury...`);
  await treasuryContract.methods.withdrawTreasuryBEP20(usdt, usdtBalance, guy).send({
    from: timelock,
  });
  console.log(`start withdrawing 666 XVS from treasury...`);
  await treasuryContract.methods.withdrawTreasuryBEP20(xvs, xvsBalance, guy).send({
    from: timelock,
  });
  console.log(`start withdrawing 1 BNB from treasury...`);
  await setBalance(treasury, "0x1");
  await treasuryContract.methods.withdrawTreasuryBNB(bnbBalance, guy).send({
    from: timelock,
  });

  console.log(`checking balance...`);
  const guyUsdtBalance = await usdtToken.methods.balanceOf(guy).call();
  const guyXvsBalance = await xvsToken.methods.balanceOf(guy).call();
  const guyBnbBalance = await web3.eth.getBalance(guy);
  await web3.eth.getBalance(treasury);

  expect(guyUsdtBalance).to.equal(usdtBalance.toString(10));
  expect(guyXvsBalance).to.equal(xvsBalance.toString(10));
  expect(new BigNumber(guyBnbBalance).eq(new BigNumber(IMPERSONATION_STARTING_BALANCE).plus(1)));
  console.log(`done!`);
}

treasuryWithdraw()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
