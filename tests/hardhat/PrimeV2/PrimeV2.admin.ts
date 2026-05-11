import { smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

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

  describe("setPrimeLeaderboard", () => {
    it("should set primeLeaderboard address and emit event", async () => {
      await expect(f.primeV2.setPrimeLeaderboard(f.primeLeaderboard.address))
        .to.emit(f.primeV2, "PrimeLeaderboardSet")
        .withArgs(ethers.constants.AddressZero, f.primeLeaderboard.address);

      expect(await f.primeV2.primeLeaderboard()).to.equal(f.primeLeaderboard.address);
    });

    it("should revert when setting zero address", async () => {
      await expect(f.primeV2.setPrimeLeaderboard(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        f.primeV2,
        "InvalidAddress",
      );
    });

    it("should revert if caller is not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(f.primeV2.setPrimeLeaderboard(f.primeLeaderboard.address)).to.be.revertedWithCustomError(
        f.primeV2,
        "Unauthorized",
      );
    });
  });

  describe("setMintThreshold", () => {
    it("should set mintThreshold and deadline, emit event", async () => {
      const threshold = convertToUnit(100, 18);
      const deadline = (await time.latest()) + 7 * 24 * 3600; // 1 week

      await expect(f.primeV2.setMintThreshold(threshold, deadline))
        .to.emit(f.primeV2, "MintThresholdUpdated")
        .withArgs(0, threshold, deadline);

      expect(await f.primeV2.mintThreshold()).to.equal(threshold);
      expect(await f.primeV2.mintDeadline()).to.equal(deadline);
    });

    it("should allow zero deadline (no expiry)", async () => {
      const threshold = convertToUnit(100, 18);

      await expect(f.primeV2.setMintThreshold(threshold, 0))
        .to.emit(f.primeV2, "MintThresholdUpdated")
        .withArgs(0, threshold, 0);

      expect(await f.primeV2.mintDeadline()).to.equal(0);
    });

    it("should allow setting threshold to zero (disables permissionless minting)", async () => {
      await f.primeV2.setMintThreshold(convertToUnit(100, 18), 0);
      await expect(f.primeV2.setMintThreshold(0, 0))
        .to.emit(f.primeV2, "MintThresholdUpdated")
        .withArgs(convertToUnit(100, 18), 0, 0);

      expect(await f.primeV2.mintThreshold()).to.equal(0);
    });

    it("should revert if caller is not authorized", async () => {
      f.accessControlManager.isAllowedToCall.returns(false);

      await expect(f.primeV2.setMintThreshold(convertToUnit(100, 18), 0)).to.be.revertedWithCustomError(
        f.primeV2,
        "Unauthorized",
      );
    });
  });

  describe("claimPrime", () => {
    const threshold = convertToUnit(100, 18);
    const aboveThreshold = convertToUnit(200, 18);
    const belowThreshold = convertToUnit(50, 18);

    beforeEach(async () => {
      await f.primeV2.setPrimeLeaderboard(f.primeLeaderboard.address);
      await f.primeV2.setMintThreshold(threshold, 0); // no deadline
      f.primeLeaderboard.getEffectiveStake.returns(aboveThreshold);
    });

    it("should mint Prime token when score meets threshold", async () => {
      const user1Address = await f.user1.getAddress();

      await expect(f.primeV2.claimPrime(user1Address)).to.emit(f.primeV2, "Mint").withArgs(user1Address);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;
      expect(await f.primeV2.totalTokens()).to.equal(1);
    });

    it("should mint when score equals threshold exactly", async () => {
      f.primeLeaderboard.getEffectiveStake.returns(threshold);
      const user1Address = await f.user1.getAddress();

      await expect(f.primeV2.claimPrime(user1Address)).to.emit(f.primeV2, "Mint").withArgs(user1Address);
    });

    it("should revert EligibilityBelowThreshold when score < threshold", async () => {
      f.primeLeaderboard.getEffectiveStake.returns(belowThreshold);
      const user1Address = await f.user1.getAddress();

      await expect(f.primeV2.claimPrime(user1Address))
        .to.be.revertedWithCustomError(f.primeV2, "EligibilityBelowThreshold")
        .withArgs(user1Address, belowThreshold, threshold);
    });

    it("should revert UserAlreadyHasPrimeToken when user already holds Prime", async () => {
      const user1Address = await f.user1.getAddress();

      await f.primeV2.claimPrime(user1Address);

      await expect(f.primeV2.claimPrime(user1Address)).to.be.revertedWithCustomError(
        f.primeV2,
        "UserAlreadyHasPrimeToken",
      );
    });

    it("should revert LeaderboardNotSet when primeLeaderboard is not configured", async () => {
      const freshPrimeV2Factory = await ethers.getContractFactory("PrimeV2");
      const freshPrimeV2 = await upgrades.deployProxy(
        freshPrimeV2Factory,
        [
          1,
          2,
          f.accessControlManager.address,
          f.primeLiquidityProvider.address,
          f.comptrollerAddress,
          f.oracle.address,
          100,
        ],
        {
          constructorArgs: [f.wrappedNativeToken, f.nativeMarket, f.xvsVault.address, f.xvsAddress, 0, false, 70080000],
          unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
        },
      );

      await expect(freshPrimeV2.claimPrime(await f.user1.getAddress())).to.be.revertedWithCustomError(
        freshPrimeV2,
        "LeaderboardNotSet",
      );
    });

    it("should revert InvalidAddress when user is address(0)", async () => {
      await expect(f.primeV2.claimPrime(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        f.primeV2,
        "InvalidAddress",
      );
    });

    it("should revert MintThresholdNotSet when mintThreshold is zero", async () => {
      await f.primeV2.setMintThreshold(0, 0);

      await expect(f.primeV2.claimPrime(await f.user1.getAddress())).to.be.revertedWithCustomError(
        f.primeV2,
        "MintThresholdNotSet",
      );
    });

    it("should revert MintWindowClosed when deadline has passed", async () => {
      const deadline = (await time.latest()) + 100;
      await f.primeV2.setMintThreshold(threshold, deadline);
      await time.increaseTo(deadline + 1);

      await expect(f.primeV2.claimPrime(await f.user1.getAddress())).to.be.revertedWithCustomError(
        f.primeV2,
        "MintWindowClosed",
      );
    });

    it("should mint when deadline is set but not yet passed", async () => {
      const deadline = (await time.latest()) + 3600;
      await f.primeV2.setMintThreshold(threshold, deadline);
      const user1Address = await f.user1.getAddress();

      await expect(f.primeV2.claimPrime(user1Address)).to.emit(f.primeV2, "Mint").withArgs(user1Address);
    });

    it("should revert ScoreUpdateInProgress when pending updates exist", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      // Issue a token so totalTokens > 0, then add market to trigger pendingScoreUpdates
      await f.primeV2["issue(address)"](user1Address);
      f.comptroller.markets.returns(true);
      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      await expect(f.primeV2.claimPrime(user2Address)).to.be.revertedWithCustomError(
        f.primeV2,
        "ScoreUpdateInProgress",
      );
    });

    it("should revert InvalidLimit when token limit is reached", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      await f.primeV2.setLimit(1);
      await f.primeV2.claimPrime(user1Address);

      await expect(f.primeV2.claimPrime(user2Address)).to.be.revertedWithCustomError(f.primeV2, "InvalidLimit");
    });
  });

  describe("claimPrimeBatch", () => {
    const threshold = convertToUnit(100, 18);
    const aboveThreshold = convertToUnit(200, 18);
    const belowThreshold = convertToUnit(50, 18);

    beforeEach(async () => {
      await f.primeV2.setPrimeLeaderboard(f.primeLeaderboard.address);
      await f.primeV2.setMintThreshold(threshold, 0); // no deadline
      f.primeLeaderboard.getEffectiveStake.returns(aboveThreshold);
    });

    it("should mint Prime tokens for multiple eligible users", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      await expect(f.primeV2.claimPrimeBatch([user1Address, user2Address]))
        .to.emit(f.primeV2, "Mint")
        .withArgs(user1Address);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;
      expect(await f.primeV2.isUserPrimeHolder(user2Address)).to.be.true;
      expect(await f.primeV2.totalTokens()).to.equal(2);
    });

    it("should skip existing Prime holders without reverting", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      await f.primeV2.claimPrime(user1Address);
      expect(await f.primeV2.totalTokens()).to.equal(1);

      await expect(f.primeV2.claimPrimeBatch([user1Address, user2Address])).not.to.be.reverted;
      expect(await f.primeV2.totalTokens()).to.equal(2);
    });

    it("should skip ineligible non-holder and emit SkippedIneligibleUser (not revert)", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      f.primeLeaderboard.getEffectiveStake.whenCalledWith(user2Address).returns(belowThreshold);

      await expect(f.primeV2.claimPrimeBatch([user1Address, user2Address]))
        .to.emit(f.primeV2, "SkippedIneligibleUser")
        .withArgs(user2Address, belowThreshold, threshold);

      // user1 minted, user2 skipped
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;
      expect(await f.primeV2.isUserPrimeHolder(user2Address)).to.be.false;
      expect(await f.primeV2.totalTokens()).to.equal(1);
    });

    it("should revert MintWindowClosed when deadline has passed", async () => {
      const deadline = (await time.latest()) + 100;
      await f.primeV2.setMintThreshold(threshold, deadline);
      await time.increaseTo(deadline + 1);

      await expect(f.primeV2.claimPrimeBatch([await f.user1.getAddress()])).to.be.revertedWithCustomError(
        f.primeV2,
        "MintWindowClosed",
      );
    });

    it("should revert LeaderboardNotSet when primeLeaderboard is not configured", async () => {
      const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
      const freshPrimeV2 = await upgrades.deployProxy(
        PrimeV2Factory,
        [
          1,
          2,
          f.accessControlManager.address,
          f.primeLiquidityProvider.address,
          f.comptrollerAddress,
          f.oracle.address,
          100,
        ],
        {
          constructorArgs: [f.wrappedNativeToken, f.nativeMarket, f.xvsVault.address, f.xvsAddress, 0, false, 70080000],
          unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
        },
      );

      await expect(freshPrimeV2.claimPrimeBatch([await f.user1.getAddress()])).to.be.revertedWithCustomError(
        freshPrimeV2,
        "LeaderboardNotSet",
      );
    });

    it("should revert MintThresholdNotSet when mintThreshold is zero", async () => {
      await f.primeV2.setMintThreshold(0, 0);

      await expect(f.primeV2.claimPrimeBatch([await f.user1.getAddress()])).to.be.revertedWithCustomError(
        f.primeV2,
        "MintThresholdNotSet",
      );
    });

    it("should revert ScoreUpdateInProgress when pending updates exist", async () => {
      const user1Address = await f.user1.getAddress();
      const user2Address = await f.user2.getAddress();

      // Issue a token so totalTokens > 0, then add market to trigger pendingScoreUpdates
      await f.primeV2["issue(address)"](user1Address);
      f.comptroller.markets.returns(true);
      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      await expect(f.primeV2.claimPrimeBatch([user2Address])).to.be.revertedWithCustomError(
        f.primeV2,
        "ScoreUpdateInProgress",
      );
    });
  });
});
