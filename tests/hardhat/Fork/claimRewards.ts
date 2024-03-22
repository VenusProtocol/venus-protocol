import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  ResilientOracleInterface,
  VBep20Harness,
  XVS,
} from "../../../typechain";
import { deployDiamond } from "../Comptroller/Diamond/scripts/deploy";
import { FORK_MAINNET, forking, initMainnetUser } from "../Fork/utils";

const { expect } = chai;
chai.use(smock.matchers);

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
export const bigNumber16 = BigNumber.from("10000000000000000"); // 1e16

const TIMELOCK_ADDRESS = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const XVS_ADDRESS = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
const VUSDT_ADDRESS = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const VETH_ADDRESS = "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8";

type SetupProtocolFixture = {
  oracle: FakeContract<ResilientOracleInterface>;
  accessControl: FakeContract<IAccessControlManagerV5>;
  comptrollerLens: MockContract<ComptrollerLens>;
  comptroller: MockContract<ComptrollerMock>;
  vusdt: VBep20Harness;
  veth: VBep20Harness;
  xvs: XVS;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const accessControl = await smock.fake<IAccessControlManagerV5>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const comptrollerLens = await ComptrollerLensFactory.deploy();

  const result = await deployDiamond("");
  const unitroller = result.unitroller;
  const comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);

  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(convertToUnit("1", 18));

  const vusdt = await ethers.getContractAt("VBep20Harness", VUSDT_ADDRESS);
  const timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS);
  await vusdt.connect(timeLockUser)._setComptroller(unitroller.address);
  const veth = await ethers.getContractAt("VBep20Harness", VETH_ADDRESS);

  oracle.getUnderlyingPrice.returns((vToken: string) => {
    if (vToken == vusdt.address) {
      return convertToUnit(1, 18);
    } else if (vToken == veth.address) {
      return convertToUnit(1200, 18);
    }
  });

  const xvs = await ethers.getContractAt("XVS", XVS_ADDRESS);

  oracle.getPrice.returns((token: string) => {
    if (token == xvs.address) {
      return convertToUnit(3, 18);
    }
  });

  const half = convertToUnit("0.5", 18);

  await comptroller._supportMarket(VUSDT_ADDRESS);
  await comptroller._setCollateralFactor(VUSDT_ADDRESS, half);
  await comptroller._supportMarket(VETH_ADDRESS);
  await comptroller._setCollateralFactor(VETH_ADDRESS, half);

  await comptroller._setMarketSupplyCaps(
    [VUSDT_ADDRESS, VETH_ADDRESS],
    [parseUnits("10000", 30), parseUnits("10000", 30)],
  );
  await comptroller._setMarketBorrowCaps(
    [VUSDT_ADDRESS, VETH_ADDRESS],
    [parseUnits("10000", 30), parseUnits("10000", 30)],
  );

  return {
    oracle,
    comptroller,
    comptrollerLens,
    accessControl,
    vusdt,
    veth,
    xvs,
  };
}

forking(34662249, () => {
  if (FORK_MAINNET) {
    describe("Seize Token Scenario", () => {
      let deployer: Signer;
      let comptroller: MockContract<ComptrollerMock>;
      let vusdt: VBep20Harness;
      let veth: VBep20Harness;
      let xvs: XVS;
      let user;

      const supplySpeed = parseUnits("1", 18);
      const borrowSpeed = parseUnits("1", 18);

      beforeEach(async () => {
        ({ comptroller, vusdt, veth, xvs } = await loadFixture(deployProtocol));

        [deployer] = await ethers.getSigners();

        await comptroller._setVenusSpeeds(
          [veth.address, vusdt.address],
          [supplySpeed, supplySpeed],
          [borrowSpeed, borrowSpeed],
        );
      });

      it("Emits events for every holders successfull seize of tokens", async () => {
        user = await initMainnetUser("0x4C45758bF15AF0714E4CC44C4EFd177e209C2890");

        const recipient = await deployer.getAddress();
        const xvsHotWallet = await initMainnetUser("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63", parseUnits("1", 18));

        await xvs.connect(xvsHotWallet).transfer(comptroller.address, parseUnits("10", 18));

        const txn = await comptroller.connect(user).seizeVenus([user.address], recipient);

        await expect(txn).to.emit(comptroller, "VenusSeized").withArgs(user.address, 75109993761328);
        await expect(txn).to.emit(comptroller, "VenusGranted").withArgs(recipient, 75109993761328);
      });

      it("Fails when the user doesn't have enough XVS funds allocated", async () => {
        user = await initMainnetUser("0x4C45758bF15AF0714E4CC44C4EFd177e209C2890");
        const recipient = await deployer.getAddress();
        await expect(comptroller.connect(user).seizeVenus([user.address], recipient)).to.be.reverted;
      });
    });

    describe("Claim Venus Scenario", () => {
      let comptroller: MockContract<ComptrollerMock>;
      let vusdt: VBep20Harness;
      let veth: VBep20Harness;
      let xvs: XVS;
      let user;

      const supplySpeed = parseUnits("1", 18);
      const borrowSpeed = parseUnits("1", 18);

      beforeEach(async () => {
        ({ comptroller, vusdt, veth, xvs } = await loadFixture(deployProtocol));
        await comptroller._setVenusSpeeds(
          [veth.address, vusdt.address],
          [supplySpeed, supplySpeed],
          [borrowSpeed, borrowSpeed],
        );
      });

      it("Transfers XVS Tokens and sets the venus accrued to XVS claim Balance", async () => {
        user = await initMainnetUser("0x4C45758bF15AF0714E4CC44C4EFd177e209C2890");

        const xvsBalanceBeforeClaim = (await xvs.balanceOf(user.address)).toNumber();

        await comptroller
          .connect(user)
          ["claimVenus(address[],address[],bool,bool,bool)"]([user.address], [veth.address], true, true, true);

        const xvsBalanceAfterClaim = (await xvs.balanceOf(user.address)).toNumber();

        expect((await comptroller.venusAccrued(user.address)).toNumber()).to.greaterThan(0);
        expect(xvsBalanceAfterClaim).to.equal(xvsBalanceBeforeClaim);
      });

      it("Transfers XVS Tokens and sets the venus accrued to 0", async () => {
        user = await initMainnetUser("0x4C45758bF15AF0714E4CC44C4EFd177e209C2890");

        const xvsHotWallet = await initMainnetUser("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63", parseUnits("1", 18));

        const xvsBalanceBeforeClaim = (await xvs.balanceOf(user.address)).toNumber();
        await xvs.connect(xvsHotWallet).transfer(comptroller.address, parseUnits("10", 18));

        await comptroller
          .connect(user)
          ["claimVenus(address[],address[],bool,bool,bool)"]([user.address], [veth.address], true, true, true);

        const xvsBalanceAfterClaim = (await xvs.balanceOf(user.address)).toNumber();

        expect(await comptroller.venusAccrued(user.address)).to.equal(0);
        expect(xvsBalanceAfterClaim).to.be.greaterThan(xvsBalanceBeforeClaim);
      });
    });
  }
});
