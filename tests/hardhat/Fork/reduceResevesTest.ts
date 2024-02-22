import { FakeContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  Comptroller__factory,
  IAccessControlManagerV8,
  IAccessControlManagerV8__factory,
  IProtocolShareReserve,
  IVBep20__factory,
  Liquidator,
  Liquidator__factory,
  ProxyAdmin__factory,
} from "../../../typechain";
import { IBEP20__factory } from "../../../typechain/factories/contracts/Utils";
import { initMainnetUser, setForkBlock } from "./utils";

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

// Address of already deployed access control manager
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
// Owner of the ACM
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
// Proxy address of Liquidator
const LIQUIDATOR = "0x0870793286aada55d39ce7f82fb2766e8004cf43";
// Address of comptroller proxy
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
// VBNB token address
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
// WBNB contrat Address
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

let impersonatedTimelock: Signer;
let liquidator: Liquidator;
let protocolShareReserve: FakeContract<IProtocolShareReserve>;
let comptroller: Comptroller;
let accessControlManager: IAccessControlManagerV8;

async function deployAndConfigureLiquidator() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));

  const liquidatorNewFactory = await ethers.getContractFactory("Liquidator");
  const liquidatorNewImpl = await liquidatorNewFactory.deploy(UNITROLLER, VBNB, WBNB);
  protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  const proxyAdmin = ProxyAdmin__factory.connect("0x2b40B43AC5F7949905b0d2Ed9D6154a8ce06084a", impersonatedTimelock);
  const data = liquidatorNewImpl.interface.encodeFunctionData("initialize", [
    convertToUnit(5, 16),
    ACM,
    protocolShareReserve.address,
  ]);
  await proxyAdmin.connect(impersonatedTimelock).upgradeAndCall(LIQUIDATOR, liquidatorNewImpl.address, data),
    { value: "1000000000" };
  liquidator = Liquidator__factory.connect(LIQUIDATOR, impersonatedTimelock);

  accessControlManager = IAccessControlManagerV8__factory.connect(ACM, impersonatedTimelock);
  await accessControlManager.giveCallPermission(LIQUIDATOR, "setPendingRedeemChunkLength(uint256)", NORMAL_TIMELOCK);
  await expect(liquidator.connect(impersonatedTimelock).setPendingRedeemChunkLength(0)).to.be.revertedWith(
    "Invalid chunk size",
  );
  await liquidator.connect(impersonatedTimelock).setPendingRedeemChunkLength(5);
}

async function configure() {
  await deployAndConfigureLiquidator();
}

if (FORK_MAINNET) {
  describe("LIQUIDATOR REDUCE RESERVES FORK TEST", async () => {
    it("Should seize and split seized tokens between liquidator and protocol share reserve, vBNB-->vETH", async () => {
      const blockNumber = 28015800;
      const repayAmount = "54070906465925481";
      const borrower = "0xB570B4374C8F01F940fAa939f61cfaF83A064F9B";
      const liquidatorAccount = "0xec641b5afa871cf097f3b375d8c77284b5ae235c";
      const borrowedToken = "0xA07c5b74C9B40447a954e1466938b865b6BBea36"; // vBNB
      const collateralToken = "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8"; // vETH

      await setForkBlock(blockNumber);
      await configure();

      const seizedVToken = IVBep20__factory.connect(collateralToken, impersonatedTimelock);
      const seizedUnderlyingToken = IBEP20__factory.connect(await seizedVToken.underlying(), impersonatedTimelock);

      const liquidatorBalanceBefore = await seizedVToken.balanceOf(liquidatorAccount);
      const protocolShareReserveBalanceBefore = await seizedUnderlyingToken.balanceOf(protocolShareReserve.address);

      const liquidatorSigner = await initMainnetUser(liquidatorAccount, ethers.utils.parseEther("2"));

      await expect(
        liquidator
          .connect(liquidatorSigner)
          .liquidateBorrow(borrowedToken, borrower, repayAmount, collateralToken, { value: repayAmount }),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      const liquidatorBalanceAfter = await seizedVToken.balanceOf(liquidatorAccount);
      const protocolShareReserveBalanceAfter = await seizedUnderlyingToken.balanceOf(protocolShareReserve.address);

      expect(liquidatorBalanceAfter).to.be.greaterThan(liquidatorBalanceBefore);
      expect(protocolShareReserveBalanceAfter).to.be.greaterThan(protocolShareReserveBalanceBefore);
    });

    it("Should seize and split seized tokens between liquidator and protocol share reserve, vBNB-->vBNB", async () => {
      const blockNumber = 27670040;
      const repayAmount = "29220000000000000";
      const borrower = "0x6B7a803BB85C7D1F67470C50358d11902d3169e0";
      const liquidatorAccount = "0x2237ca42fe3522848dcb5a2f13571f5a4e2c5c14";

      await setForkBlock(blockNumber);
      await configure();

      const seizedVToken = IVBep20__factory.connect(VBNB, impersonatedTimelock); // VBNB
      const seizedUnderlyingToken = IBEP20__factory.connect(WBNB, impersonatedTimelock); // WBNB

      const liquidatorBalanceBefore = await seizedVToken.balanceOf(liquidatorAccount);
      const protocolShareReserveBalanceBefore = await seizedUnderlyingToken.balanceOf(protocolShareReserve.address);

      const liquidatorSigner = await initMainnetUser(liquidatorAccount, ethers.utils.parseEther("2"));

      await expect(
        liquidator.connect(liquidatorSigner).liquidateBorrow(VBNB, borrower, repayAmount, VBNB, { value: repayAmount }),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      const liquidatorBalanceAfter = await seizedVToken.balanceOf(liquidatorSigner.address);
      const protocolShareReserveBalanceAfter = await seizedUnderlyingToken.balanceOf(protocolShareReserve.address);

      expect(liquidatorBalanceAfter).to.be.greaterThan(liquidatorBalanceBefore);
      expect(protocolShareReserveBalanceAfter).to.be.greaterThan(protocolShareReserveBalanceBefore);
    });

    it("Should seize and split seized tokens between liquidator and protocol share reserve, vSXP-->vADA", async () => {
      const blockNumber = 27032460;
      const repayAmount = "47000000000000000286";
      const borrower = "0xA461db6d21568E97E040C4Ab57Ff38708a4F0F67";
      const liquidatorAccount = "0x85ac420773116e916e9671cb4ac1059635606cf2";
      const borrowedToken = "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0";
      const borrowedUnderlying = "0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A";
      const collateralToken = "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec";

      await setForkBlock(blockNumber);
      await configure();

      const borrowedUnderlyingToken = IBEP20__factory.connect(borrowedUnderlying, impersonatedTimelock);
      const seizedVToken = IVBep20__factory.connect(collateralToken, impersonatedTimelock);
      const seizedUnderlyingToken = IBEP20__factory.connect(await seizedVToken.underlying(), impersonatedTimelock);

      const liquidatorBalanceBefore = await seizedVToken.balanceOf(liquidatorAccount);
      const protocolShareReserveBalanceBefore = await seizedUnderlyingToken.balanceOf(protocolShareReserve.address);

      const liquidatorSigner = await initMainnetUser(liquidatorAccount, ethers.utils.parseEther("2"));

      await borrowedUnderlyingToken.connect(liquidatorSigner).approve(LIQUIDATOR, repayAmount);
      await expect(
        liquidator.connect(liquidatorSigner).liquidateBorrow(borrowedToken, borrower, repayAmount, collateralToken),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      const liquidatorBalanceAfter = await seizedVToken.balanceOf(liquidatorAccount);
      const protocolShareReserveBalanceAfter = await seizedUnderlyingToken.balanceOf(protocolShareReserve.address);

      expect(liquidatorBalanceAfter).to.be.greaterThan(liquidatorBalanceBefore);
      expect(protocolShareReserveBalanceAfter).to.be.greaterThan(protocolShareReserveBalanceBefore);
    });

    it("Should seize split tokens between liquidator user and liquidator contract, vSXP-->vADA", async () => {
      const blockNumber = 27032460;
      const repayAmount = "47000000000000000286";
      const borrower = "0xA461db6d21568E97E040C4Ab57Ff38708a4F0F67";
      const liquidatorAccount = "0x85ac420773116e916e9671cb4ac1059635606cf2";
      const borrowedToken = "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0";
      const borrowedUnderlying = "0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A";
      const collateralToken = "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec";

      await setForkBlock(blockNumber);
      await configure();
      comptroller = Comptroller__factory.connect(UNITROLLER, impersonatedTimelock);
      await comptroller._setActionsPaused([collateralToken], [1], true);

      const borrowedUnderlyingToken = IBEP20__factory.connect(borrowedUnderlying, impersonatedTimelock);
      const seizedVToken = IVBep20__factory.connect(collateralToken, impersonatedTimelock);

      const liquidatorSigner = await initMainnetUser(liquidatorAccount, ethers.utils.parseEther("2"));
      const liquidatorContractBeforeBal = await seizedVToken.balanceOf(LIQUIDATOR);

      await borrowedUnderlyingToken.connect(liquidatorSigner).approve(LIQUIDATOR, repayAmount);
      await expect(
        liquidator.connect(liquidatorSigner).liquidateBorrow(borrowedToken, borrower, repayAmount, collateralToken),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      const liquidatorContractAfterBal = await seizedVToken.balanceOf(LIQUIDATOR);
      expect(liquidatorContractAfterBal).to.be.greaterThan(liquidatorContractBeforeBal);
    });

    it("Should success at last if initially redeem fails", async () => {
      const blockNumber = 27669447;
      const repayAmount1 = "30000000000000000";
      const borrower1 = "0x352fEdA6aeaa578dD03bdA444F6fF307b7D94121";
      const liquidatorAccount1 = "0xec641b5afa871cf097f3b375d8c77284b5ae235c";
      const borrowedToken1 = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
      const collateralToken1 = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";

      const repayAmount2 = "29220000000000000";
      const borrower2 = "0x6B7a803BB85C7D1F67470C50358d11902d3169e0";
      const liquidatorAccount2 = "0x2237ca42fe3522848dcb5a2f13571f5a4e2c5c14";
      const borrowedToken2 = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
      const collateralToken2 = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";

      const repayAmount3 = "75070613988531896";
      const borrower3 = "0x45E017b467a38f5D83094e60a1494d19655bec22";
      const liquidatorAccount3 = "0x6e7c90c493f253f574887bfc9731b151125a723f";
      const borrowedToken3 = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
      const collateralToken3 = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";

      await setForkBlock(blockNumber);
      await configure();
      comptroller = Comptroller__factory.connect(UNITROLLER, impersonatedTimelock);
      await comptroller._setActionsPaused([collateralToken1, collateralToken2], [1], true);

      const liquidatorSigner1 = await initMainnetUser(liquidatorAccount1, ethers.utils.parseEther("2"));
      const liquidatorSigner2 = await initMainnetUser(liquidatorAccount2, ethers.utils.parseEther("2"));
      const liquidatorSigner3 = await initMainnetUser(liquidatorAccount3, ethers.utils.parseEther("2"));

      await expect(
        liquidator
          .connect(liquidatorSigner1)
          .liquidateBorrow(borrowedToken1, borrower1, repayAmount1, collateralToken1, { value: repayAmount1 }),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      await expect(
        liquidator
          .connect(liquidatorSigner2)
          .liquidateBorrow(borrowedToken2, borrower2, repayAmount2, collateralToken2, { value: repayAmount2 }),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");

      await comptroller._setActionsPaused([collateralToken1, collateralToken2], [1], false);

      expect(await liquidator.pendingRedeem(0)).to.be.equal(collateralToken1);
      expect(await liquidator.pendingRedeem(1)).to.be.equal(collateralToken2);

      await expect(
        liquidator
          .connect(liquidatorSigner3)
          .liquidateBorrow(borrowedToken3, borrower3, repayAmount3, collateralToken3, { value: repayAmount3 }),
      ).to.be.emit(liquidator, "LiquidateBorrowedTokens");
    });

    it("Should revert if market is not listed", async () => {
      const blockNumber = 27032460;
      const repayAmount = "47000000000000000286";
      const borrower = "0xA461db6d21568E97E040C4Ab57Ff38708a4F0F67";
      const liquidatorAccount = "0x85ac420773116e916e9671cb4ac1059635606cf2";
      const borrowedToken = "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0";
      const collateralToken = "0x85aC420773116e916e9671Cb4Ac1059635606cF2";

      await setForkBlock(blockNumber);
      await configure();

      const liquidatorSigner = await initMainnetUser(liquidatorAccount, ethers.utils.parseEther("2"));
      await expect(
        liquidator.connect(liquidatorSigner).liquidateBorrow(borrowedToken, borrower, repayAmount, collateralToken),
      )
        .to.be.revertedWithCustomError(liquidator, "MarketNotListed")
        .withArgs(collateralToken);
    });
  });
}
