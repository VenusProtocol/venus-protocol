import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { Comptroller, Comptroller__factory, IAccessControlManager } from "../../../typechain";
const { deployDiamond } = require('../../../../script/diamond/deploy');
const { expect } = chai;
chai.use(smock.matchers);

describe("Comptroller", () => {
  let user: Signer;
  let userAddress: string;
  let comptroller: MockContract<Comptroller>;
  let accessControl: FakeContract<IAccessControlManager>;
  let comptrollerProxy:  MockContract<Comptroller>;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    user = signers[1];
    userAddress = await user.getAddress();
    comptroller = await deployDiamond();
    accessControl = await smock.fake<IAccessControlManager>("IAccessControlManager");
    comptrollerProxy = await ethers.getContractAt("Comptroller", comptroller.address);
  });

  describe("_setAccessControlManager", () => {
    it("Reverts if called by non-admin", async () => {
      expect(comptrollerProxy.connect(user)._setAccessControl(userAddress)).to.be.revertedWith("only admin can");
    });

    it("Reverts if ACM is zero address", async () => {
      expect(comptrollerProxy._setAccessControl(constants.AddressZero)).to.be.revertedWith("can't be zero address");
    });

    it("Sets ACM address in storage", async () => {
      expect(await comptrollerProxy._setAccessControl(accessControl.address))
        .to.emit(comptroller, "NewAccessControl")
        .withArgs(constants.AddressZero, accessControl.address);
    });
  });

  describe("Access Control", () => {
    beforeEach(async () => {
      await comptrollerProxy._setAccessControl(accessControl.address);
    });

    describe("setCollateralFactor", () => {
      it("Should have AccessControl", async () => {
        await expect(
          comptrollerProxy.connect(user)._setCollateralFactor(ethers.constants.AddressZero, 0),
        ).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setCollateralFactor(address,uint256)",
        );
      });
    });
    describe("setLiquidationIncentive", () => {
      it("Should have AccessControl", async () => {
        await expect(comptrollerProxy.connect(user)._setLiquidationIncentive(0)).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(userAddress, "_setLiquidationIncentive(uint256)");
      });
    });
    describe("setMarketBorrowCaps", () => {
      it("Should have AccessControl", async () => {
        await expect(comptrollerProxy.connect(user)._setMarketBorrowCaps([], [])).to.be.revertedWith("access denied");

        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setMarketBorrowCaps(address[],uint256[])",
        );
      });
    });
    describe("setMarketSupplyCaps", () => {
      it("Should have AccessControl", async () => {
        await expect(comptrollerProxy.connect(user)._setMarketSupplyCaps([], [])).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setMarketSupplyCaps(address[],uint256[])",
        );
      });
    });
    describe("setProtocolPaused", () => {
      it("Should have AccessControl", async () => {
        await expect(comptrollerProxy.connect(user)._setProtocolPaused(true)).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(userAddress, "_setProtocolPaused(bool)");
      });
    });
    describe("setActionsPaused", () => {
      it("Should have AccessControl", async () => {
        await expect(comptrollerProxy.connect(user)._setActionsPaused([], [], true)).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setActionsPaused(address[],uint256[],bool)",
        );
      });
    });
    describe("supportMarket", () => {
      it("Should have AccessControl", async () => {
        await expect(comptrollerProxy.connect(user)._supportMarket(ethers.constants.AddressZero)).to.be.revertedWith(
          "access denied",
        );
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(userAddress, "_supportMarket(address)");
      });
    });
  });
});
