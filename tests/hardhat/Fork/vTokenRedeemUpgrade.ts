import { expect } from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  ComptrollerMock,
  IERC20,
  VBep20Delegate,
  VBep20Delegate__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const USER_1 = "0x0f11fb73A8791950cBADD00e13B6d6B73d36c844";
const USER_2 = "0xA99b5972Ee6e24fDcD3dA7716d77e6c19729be77";
const USDT = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const vUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
const NORMAL_TIMELOCK = "0xce10739590001705F7FF231611ba4A48B2820327";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";
const COMPTROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const BLOCK_NUMBER = 37529314;

let user1: Signer;
let user2: Signer;
let impersonatedTimeLock: Signer;
let comptroller: ComptrollerMock;
let usdt: IERC20;
let vusdt: VBep20Delegate;
let vusdtProxy: VBep20Delegator;

async function configureTimeLock() {
  impersonatedTimeLock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("2"));
}

const FORK = process.env.FORK === "true";

async function setup() {
  user1 = await initMainnetUser(USER_1, parseUnits("2"));
  user2 = await initMainnetUser(USER_2, parseUnits("2"));
  await configureTimeLock();

  usdt = await ethers.getContractAt("IERC20", USDT);

  vusdtProxy = VBep20Delegator__factory.connect(vUSDT, impersonatedTimeLock);
  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vusdtImplementation = await vTokenFactory.deploy();
  await vusdtImplementation.deployed();

  await vusdtProxy.connect(impersonatedTimeLock)._setImplementation(vusdtImplementation.address, true, "0x00");
  vusdt = VBep20Delegate__factory.connect(vUSDT, impersonatedTimeLock);
  await vusdt.setAccessControlManager(ACM);

  comptroller = await ethers.getContractAt("ComptrollerMock", COMPTROLLER);

  return {
    usdt,
    vusdt,
    comptroller,
  };
}

if (FORK) {
  describe("RedeemBehalf and RedeemUnderlyingBehalf", async () => {
    beforeEach("setup", async () => {
      await setForkBlock(BLOCK_NUMBER);

      ({ usdt, comptroller, vusdt } = await setup());

      await comptroller.connect(user1).enterMarkets([vusdt.address]);
      await comptroller.connect(user2).enterMarkets([vusdt.address]);

      await usdt.connect(user1).approve(vusdt.address, convertToUnit(200, 6));
      await vusdt.connect(user1).mint(convertToUnit(200, 6));
    });

    describe("redeem", () => {
      it("Redeem Tokens", async () => {
        const usdtBalancePrevious = await usdt.balanceOf(USER_1);
        const vusdtBalancePrevious = await vusdt.balanceOf(USER_1);

        await vusdt.connect(user1).redeem(convertToUnit(100, 8));

        const usdtBalanceCurrent = await usdt.balanceOf(USER_1);
        const vusdtBalanceCurrent = await vusdt.balanceOf(USER_1);

        expect(usdtBalanceCurrent).to.be.greaterThan(usdtBalancePrevious);
        expect(vusdtBalanceCurrent).to.equal(vusdtBalancePrevious.sub(convertToUnit(100, 8)));
      });
    });

    describe("redeemBehalf", () => {
      it("redeemBehalf should revert when approval is not given", async () => {
        await expect(vusdt.connect(user2).redeemBehalf(USER_1, convertToUnit(1, 6))).to.be.revertedWith(
          "not an approved delegate",
        );
      });

      it("redeemBehalf should work properly", async () => {
        await comptroller.connect(user1).updateDelegate(USER_2, true);

        const user2usdtBalancePrevious = await usdt.balanceOf(USER_2);
        const vusdtBalancePrevious = await vusdt.balanceOf(USER_1);
        await vusdt.connect(user2).redeemBehalf(USER_1, convertToUnit(1, 8));
        const vusdtBalanceCurrent = await vusdt.balanceOf(USER_1);
        const user2usdtBalanceNew = await usdt.balanceOf(USER_2);

        expect(user2usdtBalanceNew).to.greaterThan(user2usdtBalancePrevious);
        expect(vusdtBalanceCurrent).to.equal(vusdtBalancePrevious.sub(convertToUnit(1, 8)));
      });
    });

    describe("redeemUnderlyingBehalf", () => {
      it("redeemUnderlyingBehalf should revert when approval is not given", async () => {
        await expect(vusdt.connect(user2).redeemUnderlyingBehalf(USER_1, convertToUnit(1, 6))).to.be.revertedWith(
          "not an approved delegate",
        );
      });

      it("redeemUnderlyingBehalf should work properly", async () => {
        await comptroller.connect(user1).updateDelegate(USER_2, true);

        const user2usdtBalancePrevious = await usdt.balanceOf(USER_2);
        const vusdtBalancePrevious = await vusdt.balanceOf(USER_1);

        await vusdt.connect(user2).redeemUnderlyingBehalf(USER_1, convertToUnit(1, 6));
        const vusdtBalanceCurrent = await vusdt.balanceOf(USER_1);

        const user2usdtBalanceNew = await usdt.balanceOf(USER_2);

        expect(user2usdtBalanceNew).to.greaterThan(user2usdtBalancePrevious);
        expect(vusdtBalanceCurrent).to.lessThan(vusdtBalancePrevious);
      });
    });
  });
}
