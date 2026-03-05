import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2 - Market Management", () => {
  let f: PrimeV2Fixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  describe("addMarket", () => {
    beforeEach(() => {
      f.comptroller.markets.returns(true);
    });

    it("should add a market successfully", async () => {
      await expect(f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)))
        .to.emit(f.primeV2, "MarketAdded")
        .withArgs(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      const allMarkets = await f.primeV2.getAllMarkets();
      expect(allMarkets).to.have.lengthOf(1);
      expect(allMarkets[0]).to.equal(f.vToken.address);

      const market = await f.primeV2.markets(f.vToken.address);
      expect(market.exists).to.be.true;
      expect(market.supplyMultiplier).to.equal(convertToUnit(2, 18));
      expect(market.borrowMultiplier).to.equal(convertToUnit(2, 18));
    });

    it("should revert when market already exists", async () => {
      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      await expect(
        f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(f.primeV2, "MarketAlreadyExists");
    });

    it("should revert when both multipliers are zero", async () => {
      await expect(f.primeV2.addMarket(f.vToken.address, 0, 0)).to.be.revertedWithCustomError(
        f.primeV2,
        "InvalidMultipliers",
      );
    });

    it("should revert when market is not listed on comptroller", async () => {
      f.comptroller.markets.returns(false);

      await expect(
        f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(f.primeV2, "InvalidVToken");
    });

    it("should revert when asset already has a market", async () => {
      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      const vToken2 = await smock.fake("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
      vToken2.underlying.returns(f.underlyingAddress);

      await expect(
        f.primeV2.addMarket(vToken2.address, convertToUnit(2, 18), convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(f.primeV2, "AssetAlreadyExists");
    });

    it("should queue score updates when market is added", async () => {
      await f.primeV2.issueBatch([await f.user1.getAddress()]);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);
    });

    it("should revert when caller not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(
        f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(f.primeV2, "Unauthorized");
    });
  });

  describe("removeMarket", () => {
    beforeEach(async () => {
      f.comptroller.markets.returns(true);
      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    });

    it("should remove a market successfully", async () => {
      await expect(f.primeV2.removeMarket(f.vToken.address))
        .to.emit(f.primeV2, "MarketRemoved")
        .withArgs(f.vToken.address);

      const allMarkets = await f.primeV2.getAllMarkets();
      expect(allMarkets).to.not.include(f.vToken.address);

      const market = await f.primeV2.markets(f.vToken.address);
      expect(market.exists).to.equal(false);
    });

    it("should revert when market does not exist", async () => {
      const nonExistentMarket = await f.user2.getAddress();
      await expect(f.primeV2.removeMarket(nonExistentMarket)).to.be.revertedWithCustomError(
        f.primeV2,
        "MarketNotSupported",
      );
    });

    it("should clear vTokenForAsset mapping", async () => {
      const underlying = await f.vToken.underlying();
      expect(await f.primeV2.vTokenForAsset(underlying)).to.equal(f.vToken.address);

      await f.primeV2.removeMarket(f.vToken.address);

      expect(await f.primeV2.vTokenForAsset(underlying)).to.equal(ethers.constants.AddressZero);
    });

    it("should queue score updates when market is removed", async () => {
      const user1Address = await f.user1.getAddress();

      f.vToken.balanceOf.whenCalledWith(user1Address).returns(0);
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([0, 0, 0]);

      await f.primeV2.issueBatch([user1Address]);

      await f.primeV2.removeMarket(f.vToken.address);

      expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);
    });

    it("should revert when caller not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(f.primeV2.removeMarket(f.vToken.address)).to.be.revertedWithCustomError(f.primeV2, "Unauthorized");
    });

    it("should allow re-adding a removed market", async () => {
      await f.primeV2.removeMarket(f.vToken.address);

      await expect(f.primeV2.addMarket(f.vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)))
        .to.emit(f.primeV2, "MarketAdded")
        .withArgs(f.vToken.address, convertToUnit(3, 18), convertToUnit(3, 18));
    });

    it("should revert when market has active members with scores", async () => {
      const user1Address = await f.user1.getAddress();

      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

      await f.primeV2["issue(address)"](user1Address);

      const market = await f.primeV2.markets(f.vToken.address);
      expect(market.sumOfMembersScore).to.be.gt(0);

      await expect(f.primeV2.removeMarket(f.vToken.address)).to.be.revertedWithCustomError(
        f.primeV2,
        "MarketHasActiveMembers",
      );
    });

    it("should allow removal after all members are burned", async () => {
      const user1Address = await f.user1.getAddress();

      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

      await f.primeV2["issue(address)"](user1Address);

      await f.primeV2.burn(user1Address);

      await expect(f.primeV2.removeMarket(f.vToken.address))
        .to.emit(f.primeV2, "MarketRemoved")
        .withArgs(f.vToken.address);
    });
  });

  describe("updateMultipliers", () => {
    beforeEach(async () => {
      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    });

    it("should update market multipliers", async () => {
      await expect(f.primeV2.updateMultipliers(f.vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)))
        .to.emit(f.primeV2, "MultiplierUpdated")
        .withArgs(
          f.vToken.address,
          convertToUnit(2, 18),
          convertToUnit(2, 18),
          convertToUnit(3, 18),
          convertToUnit(3, 18),
        );

      const market = await f.primeV2.markets(f.vToken.address);
      expect(market.supplyMultiplier).to.equal(convertToUnit(3, 18));
      expect(market.borrowMultiplier).to.equal(convertToUnit(3, 18));
    });

    it("should revert for unsupported market", async () => {
      const fakeMarket = ethers.Wallet.createRandom().address;

      await expect(
        f.primeV2.updateMultipliers(fakeMarket, convertToUnit(3, 18), convertToUnit(3, 18)),
      ).to.be.revertedWithCustomError(f.primeV2, "MarketNotSupported");
    });

    it("should queue score updates after multiplier change", async () => {
      await f.primeV2.issueBatch([await f.user1.getAddress()]);

      expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);

      await f.primeV2.updateMultipliers(f.vToken.address, convertToUnit(3, 18), convertToUnit(3, 18));
      expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);
    });

    it("should revert when caller not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(
        f.primeV2.updateMultipliers(f.vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)),
      ).to.be.revertedWithCustomError(f.primeV2, "Unauthorized");
    });
  });
});
