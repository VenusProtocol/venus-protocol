import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  Comptroller__factory,
  FaucetToken,
  FaucetToken__factory,
  Liquidator,
  Liquidator__factory,
  SimplePriceOracle__factory,
  VBep20Delegate__factory,
} from "../../../typechain";
import { VBep20Delegate } from "../../../typechain/contracts/Tokens/VTokens";
import { SimplePriceOracle } from "../../../typechain/contracts/test";
import { setForkBlock } from "./utils";

const { ethers } = require("hardhat");

const FORK_TESTNET = process.env.FORK_TESTNET === "true";

const NORMAL_TIMELOCK = "0xce10739590001705F7FF231611ba4A48B2820327";
const LIQUIDATOR = "0x55AEABa76ecf144031Ef64E222166eb28Cb4865F";
const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const VUSDC = "0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7";
const VMATIC = "0x3619bdDc61189F33365CC572DF3a68FB3b316516";
const USDC = "0x16227D60f7a0e586C66B005219dfc887D13C9531";
const CHAINLINK_ORACLE = "0xCeA29f1266e880A1482c06eD656cD08C148BaA32";
const liquidatorUser = "0xe70898180a366F204AA529708fB8f5052ea5723c";
const user = "0xcd2a514f04241b7c9A0d5d54441e92E4611929CF";
const MATIC = "0xcfeb0103d4BEfa041EA4c2dACce7B3E83E1aE7E3";
const PROTOCOL_SHARE_RESERVE = "0x8b293600C50D6fbdc6Ed4251cc75ECe29880276f";

let impersonatedTimelock: Signer;
let liquidateUserImpersonate: Signer;

let liquidator: Liquidator;
let vUsdc: VBep20Delegate;
let usdc: FaucetToken;
let matic: FaucetToken;
let comptroller: Comptroller;
let oracle: SimplePriceOracle;

if (FORK_TESTNET) {
  describe("Reduce Reserves Tests", async () => {
    before(async () => {
      /*
       *  Forking testnet
       * */
      await setForkBlock(32063902);
      await impersonateAccount(NORMAL_TIMELOCK);
      await impersonateAccount(liquidatorUser);
      await impersonateAccount(user);
      impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
      liquidateUserImpersonate = await ethers.getSigner(liquidatorUser);
      await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));
      await setBalance(liquidatorUser, ethers.utils.parseEther("2"));
      await setBalance(user, ethers.utils.parseEther("2"));

      liquidator = Liquidator__factory.connect(LIQUIDATOR, impersonatedTimelock);
      comptroller = Comptroller__factory.connect(UNITROLLER, impersonatedTimelock);
      vUsdc = VBep20Delegate__factory.connect(VUSDC, impersonatedTimelock);
      oracle = SimplePriceOracle__factory.connect(CHAINLINK_ORACLE, impersonatedTimelock);
      usdc = FaucetToken__factory.connect(USDC, impersonatedTimelock);
      matic = FaucetToken__factory.connect(MATIC, impersonatedTimelock);

      await matic.allocateTo(liquidatorUser, convertToUnit("100000", 18));
      await matic.connect(liquidateUserImpersonate).approve(liquidator.address, convertToUnit("100000", 18));
      await oracle.setDirectPrice(USDC, convertToUnit("1", 10));
      await liquidator.setMinLiquidatableVAI(convertToUnit("100", 18));
    });
    it("Liquidate Normaly if VAI debt is lower than minLiquidatableVAI", async () => {
      const liquidateUserBalanceBefore = await vUsdc.balanceOf(liquidatorUser);
      const protocolBalanceBefore = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      await expect(
        liquidator.connect(liquidateUserImpersonate).liquidateBorrow(VMATIC, user, convertToUnit(5, 18), VUSDC),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      const liquidateUserBalanceAfter = await vUsdc.balanceOf(liquidatorUser);
      const protocolBalanceAfter = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      expect(liquidateUserBalanceAfter).greaterThan(liquidateUserBalanceBefore);
      expect(protocolBalanceAfter).greaterThan(protocolBalanceBefore);
    });

    it("Liquidate but redeem failed", async () => {
      // Redeem Action Pause
      await comptroller._setActionsPaused([VUSDC], [1], true);
      const liquidateUserBalanceBefore = await vUsdc.balanceOf(liquidatorUser);
      const protocolBalanceBefore = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      await expect(
        liquidator.connect(liquidateUserImpersonate).liquidateBorrow(VMATIC, user, convertToUnit(5, 18), VUSDC),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      const liquidateUserBalanceAfter = await vUsdc.balanceOf(liquidatorUser);
      const protocolBalanceAfter = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      expect(liquidateUserBalanceAfter).greaterThan(liquidateUserBalanceBefore);
      expect(protocolBalanceAfter).equals(protocolBalanceBefore);
    });

    it("Liquidate redeem failed, redeem success", async () => {
      // Redeem Action Pause
      await comptroller._setActionsPaused([VUSDC], [1], true);
      let liquidateUserBalanceBefore = await vUsdc.balanceOf(liquidatorUser);
      let protocolBalanceBefore = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      await expect(
        liquidator.connect(liquidateUserImpersonate).liquidateBorrow(VMATIC, user, convertToUnit(3, 18), VUSDC),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      let liquidateUserBalanceAfter = await vUsdc.balanceOf(liquidatorUser);
      let protocolBalanceAfter = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      expect(liquidateUserBalanceAfter).greaterThan(liquidateUserBalanceBefore);
      // As redeem action was paused so reserves are not reduced
      expect(protocolBalanceAfter).equals(protocolBalanceBefore);
      // Redeem Action Resume
      await comptroller._setActionsPaused([VUSDC], [1], false);

      liquidateUserBalanceBefore = await vUsdc.balanceOf(liquidatorUser);
      protocolBalanceBefore = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      await expect(
        liquidator.connect(liquidateUserImpersonate).liquidateBorrow(VMATIC, user, convertToUnit(2, 18), VUSDC),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");
      // Reserves Reduced
      liquidateUserBalanceAfter = await vUsdc.balanceOf(liquidatorUser);
      protocolBalanceAfter = await usdc.balanceOf(PROTOCOL_SHARE_RESERVE);
      expect(liquidateUserBalanceAfter).greaterThan(liquidateUserBalanceBefore);
      expect(protocolBalanceAfter).greaterThan(protocolBalanceBefore);
    });
  });
}
