import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { Unitroller, Unitroller__factory } from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

describe("admin / _setPendingAdmin / _acceptAdmin", () => {
  let root: Signer;
  let accounts: Signer[];
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
      expect(await unitroller.admin()).to.equal(await root.getAddress());
    });
  });

  describe("pendingAdmin()", () => {
    it("should return correct pending admin", async () => {
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe("_setPendingAdmin()", () => {
    it("should only be callable by admin", async () => {
      expect(await unitroller.connect(accounts[0])._setPendingAdmin(await accounts[0].getAddress()))
        .to.emit(unitroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.UNAUTHORIZED,
          ComptrollerErrorReporter.FailureInfo.SET_PENDING_ADMIN_OWNER_CHECK,
        );

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(await root.getAddress());
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should properly set pending admin", async () => {
      expect(await unitroller._setPendingAdmin(await accounts[0].getAddress())); //.toSucceed();

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(await root.getAddress());
      expect(await unitroller.pendingAdmin()).to.equal(await accounts[0].getAddress());
    });

    it("should properly set pending admin twice", async () => {
      expect(await unitroller._setPendingAdmin(await accounts[0].getAddress())); //.toSucceed();
      expect(await unitroller._setPendingAdmin(await accounts[1].getAddress())); //.toSucceed();

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(await root.getAddress());
      expect(await unitroller.pendingAdmin()).to.equal(await accounts[1].getAddress());
    });

    it("should emit event", async () => {
      const result = await unitroller._setPendingAdmin(await accounts[0].getAddress());
      expect(result).to.emit(unitroller, "NewPendingAdmin").withArgs(constants.AddressZero, constants.AddressZero);
    });
  });

  describe("_acceptAdmin()", () => {
    it("should fail when pending admin is zero", async () => {
      expect(await unitroller._acceptAdmin())
        .to.emit(unitroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.UNAUTHORIZED,
          ComptrollerErrorReporter.FailureInfo.ACCEPT_ADMIN_PENDING_ADMIN_CHECK,
        );

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(await root.getAddress());
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should fail when called by another account (e.g. root)", async () => {
      expect(await unitroller._setPendingAdmin(await accounts[0].getAddress())); //.toSucceed();
      expect(await unitroller._acceptAdmin())
        .to.emit(unitroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.UNAUTHORIZED,
          ComptrollerErrorReporter.FailureInfo.ACCEPT_ADMIN_PENDING_ADMIN_CHECK,
        );

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(await root.getAddress());
      expect(await unitroller.pendingAdmin()).to.equal(await accounts[0].getAddress());
    });

    it("should succeed and set admin and clear pending admin", async () => {
      await unitroller._setPendingAdmin(await accounts[0].getAddress());
      await unitroller.connect(accounts[0])._acceptAdmin();

      // Check admin stays the same
      expect(await unitroller.admin()).to.equal(await accounts[0].getAddress());
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
    });

    it("should emit log on success", async () => {
      expect(await unitroller._setPendingAdmin(await accounts[0].getAddress())); //..toSucceed();
      const result = await unitroller.connect(accounts[0])._acceptAdmin();
      expect(result)
        .to.emit(unitroller, "NewAdmin")
        .withArgs(await root.getAddress(), await accounts[0].getAddress());
      expect(result)
        .to.emit(unitroller, "NewPendingAdmin")
        .withArgs(await accounts[0].getAddress(), constants.AddressZero);
    });
  });
});
