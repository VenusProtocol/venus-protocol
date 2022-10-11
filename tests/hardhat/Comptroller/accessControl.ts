import { Signer } from "ethers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
import {
  Comptroller,
  Comptroller__factory,
  IAccessControlManager,
} from "../../../typechain";
const { expect } = chai;
chai.use(smock.matchers);

import { ComptrollerErrorReporter } from "../util/Errors";
const { Error } = ComptrollerErrorReporter;

describe("Comptroller", () => {
  let user: Signer;
  let userAddress: string;
  let comptroller: MockContract<Comptroller>;
  let accessControl: FakeContract<IAccessControlManager>;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    user = signers[1];
    userAddress = await user.getAddress();
    const ComptrollerFactory = await smock.mock<Comptroller__factory>(
      "Comptroller"
    );
    comptroller = await ComptrollerFactory.deploy();
    accessControl = await smock.fake<IAccessControlManager>(
      "AccessControlManager"
    );
    await comptroller._setAccessControl(accessControl.address);
  });

  describe("Access Control", () => {
    it("ACM address is set in storage", async () => {
      expect(await comptroller.getVariable("accessControl")).to.equal(
        accessControl.address
      );
    });

    describe("setCollateralFactor", () => {
      it("Should have AccessControl", async () => {
        await expect(comptroller
          .connect(user)
          ._setCollateralFactor(ethers.constants.AddressZero, 0))
		  .to.be.revertedWith("access denied");;
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setCollateralFactor(address,uint256)"
        );
      });
    });
    describe("setLiquidationIncentive", () => {
      it("Should have AccessControl", async () => {
        await expect(comptroller.connect(user)._setLiquidationIncentive(0))
		.to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setLiquidationIncentive(uint256)"
        );
      });
    });
    describe("_setMarketBorrowCaps", () => {
      it("Should have AccessControl", async () => {
        await expect(
          comptroller.connect(user)._setMarketBorrowCaps([], [])
        ).to.be.revertedWith("access denied");

        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setMarketBorrowCaps(address[],uint256[])"
        );
      });
    });
    describe("setMarketSupplyCaps", () => {
      it("Should have AccessControl", async () => {
        await expect(comptroller.connect(user)._setMarketSupplyCaps([], [])).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setMarketSupplyCaps(address[],uint256[])"
        );
      });
    });
    describe("setProtocolPaused", () => {
      it("Should have AccessControl", async () => {
        await expect(
          comptroller.connect(user)._setProtocolPaused(true)
        ).to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_setProtocolPaused(bool)"
        );
      });
    });
	describe("setActionsPaused", () => {
		it("Should have AccessControl", async () => {
		  await expect(
			comptroller.connect(user)._setActionsPaused([],[],true)
		  ).to.be.revertedWith("access denied");
		  expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
			userAddress,
			"_setActionsPaused(address[],uint256[],bool)"
		  );
		});
	});
    describe("supportMarket", () => {
      it("Should have AccessControl", async () => {
        await expect(comptroller
          .connect(user)
          ._supportMarket(ethers.constants.AddressZero))
		  .to.be.revertedWith("access denied");
        expect(accessControl.isAllowedToCall).to.be.calledOnceWith(
          userAddress,
          "_supportMarket(address)"
        );
      });
    });
  });
});
