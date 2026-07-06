import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { IAccessControlManagerV8, VenusERC20, VenusERC20__factory } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const ZERO_ADDRESS = constants.AddressZero;
const TOKEN_NAME = "Ceffu Custody BTC for Venus";
const TOKEN_SYMBOL = "vceBTC";
const MINT_SIG = "mint(address,uint256)";
const BURN_SIG = "burn(address,uint256)";

type VenusERC20Fixture = {
  token: VenusERC20;
  acm: FakeContract<IAccessControlManagerV8>;
};

// Deploy helper so tests can exercise the overridden `decimals()` for several values.
async function deployToken(decimals: number): Promise<VenusERC20Fixture> {
  const acm = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  const factory = (await ethers.getContractFactory("VenusERC20")) as VenusERC20__factory;
  const token = await factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, decimals, acm.address);
  return { token, acm };
}

describe("VenusERC20", () => {
  let deployer: SignerWithAddress;
  let minter: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  before(async () => {
    [deployer, minter, alice, bob] = await ethers.getSigners();
  });

  function fixture() {
    return deployToken(18);
  }

  describe("constructor", () => {
    it("reverts when the access control manager is the zero address", async () => {
      const factory = (await ethers.getContractFactory("VenusERC20")) as VenusERC20__factory;
      await expect(factory.deploy(TOKEN_NAME, TOKEN_SYMBOL, 18, ZERO_ADDRESS)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("sets name, symbol and access control manager, and assigns ownership to the deployer", async () => {
      const { token, acm } = await loadFixture(fixture);
      expect(await token.name()).to.equal(TOKEN_NAME);
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
      expect(await token.accessControlManager()).to.equal(acm.address);
      expect(await token.owner()).to.equal(deployer.address);
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  // `decimals()` is overridden to return the constructor value instead of the hard-coded 18.
  describe("decimals() override", () => {
    for (const d of [6, 8, 18]) {
      it(`returns the ${d} decimals supplied at construction`, async () => {
        const { token } = await deployToken(d);
        expect(await token.decimals()).to.equal(d);
      });
    }
  });

  // mint() is a new function gated by the AccessControlManager.
  describe("mint()", () => {
    it("reverts with Unauthorized when the caller has no ACM permission", async () => {
      const { token, acm } = await loadFixture(fixture);
      acm.isAllowedToCall.returns(false);
      await expect(token.connect(minter).mint(alice.address, parseUnits("1", 18))).to.be.revertedWithCustomError(
        token,
        "Unauthorized",
      );
    });

    it("mints to the target account when the caller is allowed", async () => {
      const { token, acm } = await loadFixture(fixture);
      acm.isAllowedToCall.whenCalledWith(minter.address, MINT_SIG).returns(true);
      const amount = parseUnits("10", 18);

      await expect(token.connect(minter).mint(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(ZERO_ADDRESS, alice.address, amount);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(amount);
    });

    it("reverts when minting to the zero address", async () => {
      const { token, acm } = await loadFixture(fixture);
      acm.isAllowedToCall.whenCalledWith(minter.address, MINT_SIG).returns(true);
      await expect(token.connect(minter).mint(ZERO_ADDRESS, parseUnits("1", 18))).to.be.revertedWith(
        "ERC20: mint to the zero address",
      );
    });
  });

  // burn() is gated by the ACM and, unlike ERC20 burnFrom, destroys tokens from an arbitrary
  // holder without an allowance (confiscation behaviour) — cover that explicitly.
  describe("burn()", () => {
    it("reverts with Unauthorized when the caller has no ACM permission", async () => {
      const { token, acm } = await loadFixture(fixture);
      acm.isAllowedToCall.returns(false);
      await expect(token.connect(minter).burn(alice.address, parseUnits("1", 18))).to.be.revertedWithCustomError(
        token,
        "Unauthorized",
      );
    });

    it("burns from an arbitrary holder without an allowance when the caller is allowed", async () => {
      const { token, acm } = await loadFixture(fixture);
      acm.isAllowedToCall.whenCalledWith(minter.address, MINT_SIG).returns(true);
      acm.isAllowedToCall.whenCalledWith(bob.address, BURN_SIG).returns(true);
      const amount = parseUnits("10", 18);
      await token.connect(minter).mint(alice.address, amount);

      // bob (not alice) burns alice's tokens with no approval from alice.
      await expect(token.connect(bob).burn(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, ZERO_ADDRESS, amount);

      expect(await token.balanceOf(alice.address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(0);
    });

    it("reverts when the burn amount exceeds the balance", async () => {
      const { token, acm } = await loadFixture(fixture);
      acm.isAllowedToCall.whenCalledWith(minter.address, BURN_SIG).returns(true);
      await expect(token.connect(minter).burn(alice.address, parseUnits("1", 18))).to.be.revertedWith(
        "ERC20: burn amount exceeds balance",
      );
    });
  });

  describe("setAccessControlManager()", () => {
    it("reverts when the caller is not the owner", async () => {
      const { token } = await loadFixture(fixture);
      await expect(token.connect(alice).setAccessControlManager(bob.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("reverts when the new access control manager is the zero address", async () => {
      const { token } = await loadFixture(fixture);
      await expect(token.setAccessControlManager(ZERO_ADDRESS)).to.be.revertedWithCustomError(
        token,
        "ZeroAddressNotAllowed",
      );
    });

    it("updates the access control manager and emits NewAccessControlManager", async () => {
      const { token, acm } = await loadFixture(fixture);
      const newAcm = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");

      await expect(token.setAccessControlManager(newAcm.address))
        .to.emit(token, "NewAccessControlManager")
        .withArgs(acm.address, newAcm.address);

      expect(await token.accessControlManager()).to.equal(newAcm.address);
    });
  });

  // renounceOwnership is overridden with an empty body so ownership can never be given up
  // (which would permanently lock setAccessControlManager).
  describe("renounceOwnership() override", () => {
    it("is a no-op and keeps the current owner", async () => {
      const { token } = await loadFixture(fixture);
      await token.renounceOwnership();
      expect(await token.owner()).to.equal(deployer.address);
    });
  });
});
