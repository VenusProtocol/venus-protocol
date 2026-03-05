import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2 - Admin Functions", () => {
  let f: PrimeV2Fixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  describe("PrimeLeaderboard Integration", () => {
    beforeEach(async () => {
      await f.primeV2.setPrimeLeaderboard(f.primeLeaderboard.address);
    });

    it("should set PrimeLeaderboard address", async () => {
      expect(await f.primeV2.primeLeaderboard()).to.equal(f.primeLeaderboard.address);
    });

    it("should emit PrimeLeaderboardSet event", async () => {
      const newLeaderboard = ethers.Wallet.createRandom().address;

      await expect(f.primeV2.setPrimeLeaderboard(newLeaderboard))
        .to.emit(f.primeV2, "PrimeLeaderboardSet")
        .withArgs(f.primeLeaderboard.address, newLeaderboard);
    });

    it("should revert setting zero address for PrimeLeaderboard", async () => {
      await expect(f.primeV2.setPrimeLeaderboard(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        f.primeV2,
        "InvalidAddress",
      );
    });
  });

  describe("issue (single)", () => {
    it("should issue Prime token to a single user", async () => {
      const user1Address = await f.user1.getAddress();

      await expect(f.primeV2["issue(address)"](user1Address)).to.emit(f.primeV2, "Mint").withArgs(user1Address);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;
      expect(await f.primeV2.totalTokens()).to.equal(1);
    });

    it("should revert if user already has Prime", async () => {
      const user1Address = await f.user1.getAddress();

      await f.primeV2["issue(address)"](user1Address);

      await expect(f.primeV2["issue(address)"](user1Address)).to.be.revertedWithCustomError(
        f.primeV2,
        "UserAlreadyHasPrimeToken",
      );
    });

    it("should revert if caller is not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(f.primeV2["issue(address)"](await f.user1.getAddress())).to.be.revertedWithCustomError(
        f.primeV2,
        "Unauthorized",
      );
    });
  });

  describe("issueBatch", () => {
    it("should issue Prime tokens to multiple users", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      await expect(f.primeV2.issueBatch([user1Address, user2Address]))
        .to.emit(f.primeV2, "Mint")
        .withArgs(user1Address);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;
      expect(await f.primeV2.isUserPrimeHolder(user2Address)).to.be.true;
      expect(await f.primeV2.totalTokens()).to.equal(2);
    });

    it("should skip issuing to user who already has Prime", async () => {
      const user1Address = await f.user1.getAddress();

      await f.primeV2["issue(address)"](user1Address);
      expect(await f.primeV2.totalTokens()).to.equal(1);

      await expect(f.primeV2.issueBatch([user1Address])).not.to.be.reverted;
      expect(await f.primeV2.totalTokens()).to.equal(1);
    });

    it("should revert if caller is not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(f.primeV2.issueBatch([await f.user1.getAddress()])).to.be.revertedWithCustomError(
        f.primeV2,
        "Unauthorized",
      );
    });
  });

  describe("burn", () => {
    it("should burn Prime token", async () => {
      const user1Address = await f.user1.getAddress();

      await f.primeV2.issueBatch([user1Address]);
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;

      await expect(f.primeV2.burn(user1Address)).to.emit(f.primeV2, "Burn").withArgs(user1Address);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;
    });

    it("should revert if user has no Prime token", async () => {
      const user1Address = await f.user1.getAddress();

      await expect(f.primeV2.burn(user1Address)).to.be.revertedWithCustomError(f.primeV2, "UserHasNoPrimeToken");
    });
  });

  describe("burnBatch", () => {
    it("should burn multiple Prime tokens", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      await f.primeV2.issueBatch([user1Address, user2Address]);
      expect(await f.primeV2.totalTokens()).to.equal(2);

      await expect(f.primeV2.burnBatch([user1Address, user2Address]))
        .to.emit(f.primeV2, "Burn")
        .withArgs(user1Address);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;
      expect(await f.primeV2.isUserPrimeHolder(user2Address)).to.be.false;
      expect(await f.primeV2.totalTokens()).to.equal(0);
    });

    it("should skip user who has no Prime token", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      await f.primeV2.issueBatch([user1Address]);
      expect(await f.primeV2.totalTokens()).to.equal(1);

      await expect(f.primeV2.burnBatch([user1Address, user2Address])).not.to.be.reverted;
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;
      expect(await f.primeV2.totalTokens()).to.equal(0);
    });

    it("should revert if caller is not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(f.primeV2.burnBatch([await f.user1.getAddress()])).to.be.revertedWithCustomError(
        f.primeV2,
        "Unauthorized",
      );
    });
  });

  describe("setLimit", () => {
    it("should update limit", async () => {
      await expect(f.primeV2.setLimit(1000)).to.emit(f.primeV2, "MintLimitUpdated").withArgs(500, 1000);

      expect(await f.primeV2.tokenLimit()).to.equal(1000);
    });

    it("should revert if new limit is less than current count", async () => {
      await f.primeV2.issueBatch([await f.user1.getAddress()]);

      await expect(f.primeV2.setLimit(0)).to.be.revertedWithCustomError(f.primeV2, "InvalidLimit");
    });
  });

  describe("updateAlpha", () => {
    it("should update alpha parameters", async () => {
      await expect(f.primeV2.updateAlpha(2, 3)).to.emit(f.primeV2, "AlphaUpdated").withArgs(1, 2, 2, 3);

      expect(await f.primeV2.alphaNumerator()).to.equal(2);
      expect(await f.primeV2.alphaDenominator()).to.equal(3);
    });

    it("should revert with invalid alpha (numerator > denominator)", async () => {
      await expect(f.primeV2.updateAlpha(3, 2)).to.be.revertedWithCustomError(f.primeV2, "InvalidAlphaArguments");
    });

    it("should revert with zero denominator", async () => {
      await expect(f.primeV2.updateAlpha(1, 0)).to.be.revertedWithCustomError(f.primeV2, "InvalidAlphaArguments");
    });
  });

  describe("pause/unpause", () => {
    it("should pause and unpause", async () => {
      await f.primeV2.pause();
      expect(await f.primeV2.paused()).to.be.true;

      await f.primeV2.unpause();
      expect(await f.primeV2.paused()).to.be.false;
    });
  });

  describe("setMaxLoopsLimit", () => {
    it("should update max loops limit", async () => {
      await f.primeV2.setMaxLoopsLimit(200);
      expect(await f.primeV2.maxLoopsLimit()).to.equal(200);
    });
  });

  describe("View Functions", () => {
    it("should return XVS balance of user", async () => {
      const user1Address = await f.user1.getAddress();
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(5000, 18), 0, 0]);

      const balance = await f.primeV2.xvsBalanceOfUser(user1Address);
      expect(balance).to.equal(convertToUnit(5000, 18));
    });

    it("should return XVS balance minus pending withdrawals", async () => {
      const user1Address = await f.user1.getAddress();
      f.xvsVault.getUserInfo
        .whenCalledWith(f.xvsAddress, 0, user1Address)
        .returns([convertToUnit(5000, 18), 0, convertToUnit(1000, 18)]);

      const balance = await f.primeV2.xvsBalanceOfUser(user1Address);
      expect(balance).to.equal(convertToUnit(4000, 18));
    });

    it("should return zero if pending withdrawals exceed balance", async () => {
      const user1Address = await f.user1.getAddress();
      f.xvsVault.getUserInfo
        .whenCalledWith(f.xvsAddress, 0, user1Address)
        .returns([convertToUnit(1000, 18), 0, convertToUnit(2000, 18)]);

      const balance = await f.primeV2.xvsBalanceOfUser(user1Address);
      expect(balance).to.equal(0);
    });

    it("should return all markets", async () => {
      const markets = await f.primeV2.getAllMarkets();
      expect(markets).to.be.an("array");
      expect(markets.length).to.equal(0);
    });
  });

  describe("Token Limits", () => {
    it("should enforce token limit", async () => {
      await f.primeV2.setLimit(2);

      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();
      const user3Address = await f.user3.getAddress();

      await f.primeV2.issueBatch([user1Address, user2Address]);

      await expect(f.primeV2.issueBatch([user3Address])).to.be.revertedWithCustomError(f.primeV2, "InvalidLimit");
    });
  });
});
