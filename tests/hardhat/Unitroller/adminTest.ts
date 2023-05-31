import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";

import { Unitroller, Unitroller__factory } from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

describe("admin / _setPendingAdmin / _acceptAdmin", () => {
  let root: SignerWithAddress;
  let accounts: SignerWithAddress[];
  let unitroller: MockContract<Unitroller>;

  async function unitrollerFixture(): Promise<MockContract<Unitroller>> {
    [root, ...accounts] = await ethers.getSigners();
    const factory = await smock.mock<Unitroller__factory>("Unitroller");
    const unitroller = await factory.deploy();
    return unitroller;
  }

  beforeEach(async () => {
    unitroller = await loadFixture(unitrollerFixture);
  });

  describe("admin()", () => {
    it("should return correct admin", async () => {
      expect(await unitroller.admin()).to.equal(root.address);
    });
  });

  describe("pendingAdmin()", () => {
    it("should return correct pending admin", async () => {
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe("_setPendingAdmin()", () => {
    it("should only be callable by admin", async () => {
      await expect(await unitroller.connect(accounts[0])._setPendingAdmin(accounts[0].address))
        .to.emit(unitroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.UNAUTHORIZED,
          ComptrollerErrorReporter.FailureInfo.SET_PENDING_ADMIN_OWNER_CHECK,
          0,
        );

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(root.address);
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should properly set pending admin", async () => {
      expect(await unitroller._setPendingAdmin(accounts[0].address)); //.toSucceed();

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(root.address);
      expect(await unitroller.pendingAdmin()).to.equal(accounts[0].address);
    });

    it("should properly set pending admin twice", async () => {
      expect(await unitroller._setPendingAdmin(accounts[0].address)); //.toSucceed();
      expect(await unitroller._setPendingAdmin(accounts[1].address)); //.toSucceed();

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(root.address);
      expect(await unitroller.pendingAdmin()).to.equal(accounts[1].address);
    });

    it("should emit event", async () => {
      const result = await unitroller._setPendingAdmin(accounts[0].address);
      await expect(result).to.emit(unitroller, "NewPendingAdmin").withArgs(constants.AddressZero, accounts[0].address);
    });
  });

  describe("_acceptAdmin()", () => {
    it("should fail when pending admin is zero", async () => {
      await expect(await unitroller._acceptAdmin())
        .to.emit(unitroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.UNAUTHORIZED,
          ComptrollerErrorReporter.FailureInfo.ACCEPT_ADMIN_PENDING_ADMIN_CHECK,
          0,
        );

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(root.address);
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should fail when called by another account (e.g. root)", async () => {
      expect(await unitroller._setPendingAdmin(accounts[0].address)); //.toSucceed();
      await expect(await unitroller._acceptAdmin())
        .to.emit(unitroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.UNAUTHORIZED,
          ComptrollerErrorReporter.FailureInfo.ACCEPT_ADMIN_PENDING_ADMIN_CHECK,
          0,
        );

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(root.address);
      expect(await unitroller.pendingAdmin()).to.equal(accounts[0].address);
    });

    it("should succeed and set admin and clear pending admin", async () => {
      await unitroller._setPendingAdmin(accounts[0].address);
      await unitroller.connect(accounts[0])._acceptAdmin();

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(accounts[0].address);
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should emit log on success", async () => {
      expect(await unitroller._setPendingAdmin(accounts[0].address)); //..toSucceed();
      const result = await unitroller.connect(accounts[0])._acceptAdmin();
      await expect(result).to.emit(unitroller, "NewAdmin").withArgs(root.address, accounts[0].address);
      await expect(result).to.emit(unitroller, "NewPendingAdmin").withArgs(accounts[0].address, constants.AddressZero);
    });
  });
});
