import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToBigInt } from "../../../helpers/utils";
import { ComptrollerMock, Liquidator, Liquidator__factory, MockVBNB, VBep20Immutable } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

type LiquidatorFixture = {
  vBep20: FakeContract<VBep20Immutable>;
  vBnb: FakeContract<MockVBNB>;
  comptroller: FakeContract<ComptrollerMock>;
  liquidator: MockContract<Liquidator>;
};

async function deployLiquidator(): Promise<LiquidatorFixture> {
  const [, treasury] = await ethers.getSigners();
  const treasuryPercentMantissa = convertToBigInt("0.05", 18);

  const comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
  comptroller.liquidationIncentiveMantissa.returns(convertToBigInt("1.1", 18));
  const vBnb = await smock.fake<MockVBNB>("MockVBNB");
  const vBep20 = await smock.fake<VBep20Immutable>("VBep20Immutable");

  const Liquidator = await smock.mock<Liquidator__factory>("Liquidator");
  const liquidator = await upgrades.deployProxy(Liquidator, [treasuryPercentMantissa], {
    constructorArgs: [comptroller.address, vBnb.address, treasury.address],
  });

  return { comptroller, vBnb, vBep20, liquidator };
}

function configure(fixture: LiquidatorFixture) {
  const { comptroller } = fixture;
  comptroller.liquidationIncentiveMantissa.returns(convertToBigInt("1.1", 18));
}

describe("Liquidator", () => {
  let borrower: SignerWithAddress;
  let guy: SignerWithAddress;

  let vBep20: FakeContract<VBep20Immutable>;
  let liquidator: MockContract<Liquidator>;

  beforeEach(async () => {
    [, , borrower, guy] = await ethers.getSigners();
    const contracts = await loadFixture(deployLiquidator);
    configure(contracts);
    ({ vBep20, liquidator } = contracts);
  });

  describe("Restricted liquidations", () => {
    describe("addToAllowlist", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).addToAllowlist(borrower.address, guy.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("adds address to allowlist", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        expect(await liquidator.allowedLiquidatorsByAccount(borrower.address, guy.address)).to.equal(true);
      });

      it("fails if already in the allowlist", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        await expect(liquidator.addToAllowlist(borrower.address, guy.address))
          .to.be.revertedWithCustomError(liquidator, "AlreadyAllowed")
          .withArgs(borrower.address, guy.address);
      });

      it("emits LiquidationPermissionGranted event", async () => {
        await expect(liquidator.addToAllowlist(borrower.address, guy.address))
          .to.emit(liquidator, "AllowlistEntryAdded")
          .withArgs(borrower.address, guy.address);
      });
    });

    describe("removeFromAllowlist", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).removeFromAllowlist(borrower.address, guy.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("fails if not in the allowlist", async () => {
        await expect(liquidator.removeFromAllowlist(borrower.address, guy.address))
          .to.be.revertedWithCustomError(liquidator, "AllowlistEntryNotFound")
          .withArgs(borrower.address, guy.address);
      });

      it("removes address from allowlist", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        expect(await liquidator.allowedLiquidatorsByAccount(borrower.address, guy.address)).to.equal(true);
        await liquidator.removeFromAllowlist(borrower.address, guy.address);
        expect(await liquidator.allowedLiquidatorsByAccount(borrower.address, guy.address)).to.equal(false);
      });

      it("emits LiquidationPermissionRevoked event", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        await expect(liquidator.removeFromAllowlist(borrower.address, guy.address))
          .to.emit(liquidator, "AllowlistEntryRemoved")
          .withArgs(borrower.address, guy.address);
      });
    });

    describe("restrictLiquidation", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).restrictLiquidation(borrower.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("restricts liquidations for the borrower", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(true);
      });

      it("fails if already restricted", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(true);
        await expect(liquidator.restrictLiquidation(borrower.address))
          .to.be.revertedWithCustomError(liquidator, "AlreadyRestricted")
          .withArgs(borrower.address);
      });

      it("emits LiquidationRestricted event", async () => {
        await expect(liquidator.restrictLiquidation(borrower.address))
          .to.emit(liquidator, "LiquidationRestricted")
          .withArgs(borrower.address);
      });
    });

    describe("unrestrictLiquidation", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).unrestrictLiquidation(borrower.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("removes the restrictions for the borrower", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(true);
        await liquidator.unrestrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(false);
      });

      it("fails if not restricted", async () => {
        await expect(liquidator.unrestrictLiquidation(borrower.address))
          .to.be.revertedWithCustomError(liquidator, "NoRestrictionsExist")
          .withArgs(borrower.address);
      });

      it("emits LiquidationRestricted event", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        await expect(liquidator.unrestrictLiquidation(borrower.address))
          .to.emit(liquidator, "LiquidationRestrictionsDisabled")
          .withArgs(borrower.address);
      });
    });

    describe("liquidateBorrow", async () => {
      it("fails if the liquidation is restricted", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        const repayAmount = "1";
        await expect(
          liquidator.connect(guy).liquidateBorrow(vBep20.address, borrower.address, repayAmount, vBep20.address),
        )
          .to.be.revertedWithCustomError(liquidator, "LiquidationNotAllowed")
          .withArgs(borrower.address, guy.address);
      });

      it("proceeds with the liquidation if the guy is allowed to", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        await liquidator.addToAllowlist(borrower.address, guy.address);
        const repayAmount = "1";
        await expect(
          liquidator.connect(guy).liquidateBorrow(vBep20.address, borrower.address, repayAmount, vBep20.address),
        ).to.not.be.revertedWithCustomError(liquidator, "LiquidationNotAllowed");
      });
    });
  });
});
