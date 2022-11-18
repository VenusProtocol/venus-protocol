import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  Liquidator__factory,
  Liquidator,
  VBNB,
  VBep20Immutable,
  VAIController
} from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

type LiquidatorFixture = {
  vaiController: FakeContract<VAIController>;
  vBep20: FakeContract<VBep20Immutable>;
  vBnb: FakeContract<VBNB>;
  comptroller: FakeContract<Comptroller>;
  liquidator: MockContract<Liquidator>;
};

async function deployLiquidator(): Promise<LiquidatorFixture> {
  const [admin, treasury] = await ethers.getSigners();
  const treasuryPercentMantissa = convertToUnit("0.05", 18);

  const comptroller = await smock.fake<Comptroller>("Comptroller");
  const vaiController = await smock.fake<VAIController>("VAIController");
  const vBnb = await smock.fake<VBNB>("VBNB");
  const vBep20 = await smock.fake<VBep20Immutable>("VBep20Immutable");

  const Liquidator = await smock.mock<Liquidator__factory>("Liquidator");
  const liquidator = await Liquidator.deploy(
    admin.address,
    vBnb.address,
    comptroller.address,
    vaiController.address,
    treasury.address,
    treasuryPercentMantissa
  );
  
  return { comptroller, vaiController, vBnb, vBep20, liquidator };
}

function configure(fixture: LiquidatorFixture) {
  const { comptroller } = fixture;
  comptroller.liquidationIncentiveMantissa.returns(convertToUnit("1.1", 18));
}

describe("Liquidator", () => {
  let admin: SignerWithAddress;
  let treasury: SignerWithAddress;
  let borrower: SignerWithAddress;
  let guy: SignerWithAddress;
  let accounts: SignerWithAddress[];

  let vaiController: FakeContract<VAIController>;
  let vBep20: FakeContract<VBep20Immutable>;
  let vBnb: FakeContract<VBNB>;
  let comptroller: FakeContract<Comptroller>;
  let liquidator: MockContract<Liquidator>;

  beforeEach(async () => {
    [admin, treasury, borrower, guy, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(deployLiquidator);
    configure(contracts);
    ({ vaiController, vBep20, vBnb, comptroller, liquidator } = contracts);
  });

  describe("Restricted liquidations", () => {
    describe("addToAllowlist", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).addToAllowlist(borrower.address, guy.address))
          .to.be.revertedWith("only admin allowed");
      })

      it("adds address to allowlist", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        expect(await liquidator.liquidationAllowed(borrower.address, guy.address)).to.equal(true);
      });

      it("fails if already in the allowlist", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        await expect(liquidator.addToAllowlist(borrower.address, guy.address))
          .to.be.revertedWith("already allowed");
      });

      it("emits LiquidationPermissionGranted event", async () => {
        await expect(liquidator.addToAllowlist(borrower.address, guy.address))
          .to.emit(liquidator, "AllowlistEntryAdded")
          .withArgs(borrower.address, guy.address);
      });
    });

    describe("removeFromAllowlist", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).removeFromAllowlist(borrower.address, guy.address))
          .to.be.revertedWith("only admin allowed");
      });

      it("fails if not in the allowlist", async () => {
        await expect(liquidator.removeFromAllowlist(borrower.address, guy.address))
          .to.be.revertedWith("not in allowlist");
      });

      it("removes address from allowlist", async () => {
        await liquidator.addToAllowlist(borrower.address, guy.address);
        expect(await liquidator.liquidationAllowed(borrower.address, guy.address)).to.equal(true);
        await liquidator.removeFromAllowlist(borrower.address, guy.address);
        expect(await liquidator.liquidationAllowed(borrower.address, guy.address)).to.equal(false);
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
        await expect(liquidator.connect(guy).restrictLiquidation(borrower.address))
          .to.be.revertedWith("only admin allowed");
      });

      it("restricts liquidations for the borrower", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(true);
      });

      it("fails if already restricted", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(true);
        await expect(liquidator.restrictLiquidation(borrower.address))
          .to.be.revertedWith("already restricted");
      });

      it("emits LiquidationRestricted event", async () => {
        await expect(liquidator.restrictLiquidation(borrower.address))
          .to.emit(liquidator, "LiquidationRestricted")
          .withArgs(borrower.address);
      });
    });

    describe("unrestrictLiquidation", async () => {
      it("fails if called by a non-admin", async () => {
        await expect(liquidator.connect(guy).unrestrictLiquidation(borrower.address))
          .to.be.revertedWith("only admin allowed");
      });

      it("removes the restrictions for the borrower", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(true);
        await liquidator.unrestrictLiquidation(borrower.address);
        expect(await liquidator.liquidationRestricted(borrower.address)).to.equal(false);
      });

      it("fails if not restricted", async () => {
        await expect(liquidator.unrestrictLiquidation(borrower.address))
          .to.be.revertedWith("not restricted");
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
        await expect(liquidator.liquidateBorrow(vBep20.address, borrower.address, repayAmount, vBep20.address))
          .to.be.revertedWith("restricted to allowed liquidators only");
      });

      it("proceeds with the liquidation if the guy is allowed to", async () => {
        await liquidator.restrictLiquidation(borrower.address);
        await liquidator.addToAllowlist(borrower.address, guy.address);
        const repayAmount = "1";
        await expect(liquidator.connect(guy).liquidateBorrow(vBep20.address, borrower.address, repayAmount, vBep20.address))
          .to.not.be.revertedWith("restricted to allowed liquidators only");
      });
    });
  });
});