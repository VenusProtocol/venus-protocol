import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Contract, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  IAccessControlManagerV8,
  IPrimeLeaderboard,
  IPrimeLiquidityProvider,
  IXVSVault,
  InterfaceComptroller,
  PrimeV2,
  ResilientOracleInterface,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const MAXIMUM_XVS_CAP = convertToUnit(100000, 18);
const BLOCKS_PER_YEAR = 70080000;

describe("PrimeV2", () => {
  let primeV2: PrimeV2;
  let accessControlManager: FakeContract<IAccessControlManagerV8>;
  let primeLeaderboard: FakeContract<IPrimeLeaderboard>;
  let primeLiquidityProvider: FakeContract<IPrimeLiquidityProvider>;
  let xvsVault: FakeContract<IXVSVault>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let admin: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  // Mock addresses
  let comptroller: FakeContract<InterfaceComptroller>;
  let vToken: FakeContract<Contract>;
  let xvsAddress: string;
  let comptrollerAddress: string;
  let wrappedNativeToken: string;
  let nativeMarket: string;
  let underlyingToken: FakeContract<Contract>;
  let underlyingAddress: string;

  const deployFixture = async () => {
    [admin, user1, user2, user3] = await ethers.getSigners();

    // Generate mock addresses
    xvsAddress = ethers.Wallet.createRandom().address;
    wrappedNativeToken = ethers.Wallet.createRandom().address;
    nativeMarket = ethers.Wallet.createRandom().address;

    // Mock contracts
    accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
    accessControlManager.isAllowedToCall.returns(true);

    primeLeaderboard = await smock.fake<IPrimeLeaderboard>(
      "contracts/Tokens/Prime/IPrimeLeaderboard.sol:IPrimeLeaderboard",
    );
    primeLiquidityProvider = await smock.fake<IPrimeLiquidityProvider>("IPrimeLiquidityProvider");
    xvsVault = await smock.fake<IXVSVault>("IXVSVault");
    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    comptroller = await smock.fake<InterfaceComptroller>(
      "contracts/Tokens/Prime/Interfaces/InterfaceComptroller.sol:InterfaceComptroller",
    );
    vToken = await smock.fake("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
    comptrollerAddress = comptroller.address;

    // Create underlying token mock with decimals()
    underlyingToken = await smock.fake(
      "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol:IERC20MetadataUpgradeable",
    );
    underlyingAddress = underlyingToken.address;
    underlyingToken.decimals.returns(18);

    // Setup XVSVault mock
    xvsVault.xvsAddress.returns(xvsAddress);
    xvsVault.getUserInfo.returns([convertToUnit(1000, 18), 0, 0]); // Default: 1000 XVS staked

    // Setup Oracle mock
    oracle.getPrice.returns(convertToUnit(3, 18)); // $3 per XVS
    oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));
    oracle.updateAssetPrice.returns();
    oracle.updatePrice.returns();

    // Setup Comptroller mock
    comptroller.markets.returns(true); // All markets listed by default

    // Setup VToken mock
    vToken.underlying.returns(underlyingAddress);
    vToken.borrowBalanceStored.returns(0);
    vToken.exchangeRateStored.returns(convertToUnit(1, 18));
    vToken.balanceOf.returns(0);

    // Deploy PrimeV2
    const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
    primeV2 = (await upgrades.deployProxy(
      PrimeV2Factory,
      [
        1, // alphaNumerator
        2, // alphaDenominator
        accessControlManager.address,
        primeLiquidityProvider.address,
        comptrollerAddress,
        oracle.address,
        100, // loopsLimit
      ],
      {
        constructorArgs: [
          wrappedNativeToken,
          nativeMarket,
          MAXIMUM_XVS_CAP,
          xvsVault.address,
          xvsAddress,
          0, // xvsVaultPoolId
          false,
          BLOCKS_PER_YEAR,
        ],
        unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
      },
    )) as PrimeV2;

    return {
      primeV2,
      accessControlManager,
      primeLeaderboard,
      primeLiquidityProvider,
      xvsVault,
      oracle,
      comptroller,
      vToken,
      underlyingToken,
      admin,
      user1,
      user2,
      user3,
    };
  };

  beforeEach(async () => {
    ({
      primeV2,
      accessControlManager,
      primeLeaderboard,
      primeLiquidityProvider,
      xvsVault,
      oracle,
      comptroller,
      vToken,
      underlyingToken,
      admin,
      user1,
      user2,
      user3,
    } = await loadFixture(deployFixture));

    // Reset mock state (smock state isn't part of EVM snapshot)
    accessControlManager.isAllowedToCall.returns(true);
  });

  describe("Initialization", () => {
    it("should initialize with correct values", async () => {
      expect(await primeV2.xvsVault()).to.equal(xvsVault.address);
      expect(await primeV2.xvsVaultRewardToken()).to.equal(xvsAddress);
      expect(await primeV2.xvsVaultPoolId()).to.equal(0);
      expect(await primeV2.alphaNumerator()).to.equal(1);
      expect(await primeV2.alphaDenominator()).to.equal(2);
      expect(await primeV2.primeLiquidityProvider()).to.equal(primeLiquidityProvider.address);
      expect(await primeV2.corePoolComptroller()).to.equal(comptrollerAddress);
    });

    it("should set default limit", async () => {
      expect(await primeV2.tokenLimit()).to.equal(500);
    });

    it("should revert if initialized twice", async () => {
      await expect(
        primeV2.initialize(
          1,
          2,
          accessControlManager.address,
          primeLiquidityProvider.address,
          comptrollerAddress,
          oracle.address,
          100,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should revert with zero xvsVault address in constructor", async () => {
      const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");

      await expect(
        upgrades.deployProxy(
          PrimeV2Factory,
          [1, 2, accessControlManager.address, primeLiquidityProvider.address, comptrollerAddress, oracle.address, 100],
          {
            constructorArgs: [
              wrappedNativeToken,
              nativeMarket,
              MAXIMUM_XVS_CAP,
              ethers.constants.AddressZero,
              xvsAddress,
              0,
              false,
              BLOCKS_PER_YEAR,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
          },
        ),
      ).to.be.revertedWithCustomError(PrimeV2Factory, "InvalidAddress");
    });

    it("should revert with invalid alpha arguments", async () => {
      const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");

      // alphaNumerator > alphaDenominator
      await expect(
        upgrades.deployProxy(
          PrimeV2Factory,
          [
            3, // numerator > denominator
            2,
            accessControlManager.address,
            primeLiquidityProvider.address,
            comptrollerAddress,
            oracle.address,
            100,
          ],
          {
            constructorArgs: [
              wrappedNativeToken,
              nativeMarket,
              MAXIMUM_XVS_CAP,
              xvsVault.address,
              xvsAddress,
              0,
              false,
              BLOCKS_PER_YEAR,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
          },
        ),
      ).to.be.revertedWithCustomError(PrimeV2Factory, "InvalidAlphaArguments");
    });
  });

  describe("PrimeLeaderboard Integration", () => {
    beforeEach(async () => {
      // Set the PrimeLeaderboard address
      await primeV2.setPrimeLeaderboard(primeLeaderboard.address);
    });

    it("should set PrimeLeaderboard address", async () => {
      expect(await primeV2.primeLeaderboard()).to.equal(primeLeaderboard.address);
    });

    it("should emit PrimeLeaderboardSet event", async () => {
      const newLeaderboard = ethers.Wallet.createRandom().address;

      await expect(primeV2.setPrimeLeaderboard(newLeaderboard))
        .to.emit(primeV2, "PrimeLeaderboardSet")
        .withArgs(primeLeaderboard.address, newLeaderboard);
    });

    it("should revert setting zero address for PrimeLeaderboard", async () => {
      await expect(primeV2.setPrimeLeaderboard(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        primeV2,
        "InvalidAddress",
      );
    });
  });

  describe("Admin Functions", () => {
    describe("issue (single)", () => {
      it("should issue Prime token to a single user", async () => {
        const user1Address = await user1.getAddress();

        await expect(primeV2["issue(address)"](user1Address)).to.emit(primeV2, "Mint").withArgs(user1Address);

        expect(await primeV2.isUserPrimeHolder(user1Address)).to.be.true;
        expect(await primeV2.totalTokens()).to.equal(1);
      });

      it("should revert if user already has Prime", async () => {
        const user1Address = await user1.getAddress();

        await primeV2["issue(address)"](user1Address);

        await expect(primeV2["issue(address)"](user1Address)).to.be.revertedWithCustomError(
          primeV2,
          "UserAlreadyHasPrimeToken",
        );
      });

      it("should revert if caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(primeV2["issue(address)"](await user1.getAddress())).to.be.revertedWithCustomError(
          primeV2,
          "Unauthorized",
        );
      });
    });

    describe("issueBatch", () => {
      it("should issue Prime tokens to multiple users", async () => {
        const user1Address = await user1.getAddress();
        const user2Address = await user2.getAddress();

        await expect(primeV2.issueBatch([user1Address, user2Address]))
          .to.emit(primeV2, "Mint")
          .withArgs(user1Address);

        expect(await primeV2.isUserPrimeHolder(user1Address)).to.be.true;
        expect(await primeV2.isUserPrimeHolder(user2Address)).to.be.true;
        expect(await primeV2.totalTokens()).to.equal(2);
      });

      it("should skip issuing to user who already has Prime", async () => {
        const user1Address = await user1.getAddress();

        await primeV2["issue(address)"](user1Address);
        expect(await primeV2.totalTokens()).to.equal(1);

        // issueBatch should skip already-issued user (not revert)
        await expect(primeV2.issueBatch([user1Address])).not.to.be.reverted;
        expect(await primeV2.totalTokens()).to.equal(1);
      });

      it("should revert if caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(primeV2.issueBatch([await user1.getAddress()])).to.be.revertedWithCustomError(
          primeV2,
          "Unauthorized",
        );
      });
    });

    describe("burn", () => {
      it("should burn Prime token", async () => {
        const user1Address = await user1.getAddress();

        // First issue
        await primeV2.issueBatch([user1Address]);
        expect(await primeV2.isUserPrimeHolder(user1Address)).to.be.true;

        // Then burn
        await expect(primeV2.burn(user1Address)).to.emit(primeV2, "Burn").withArgs(user1Address);

        expect(await primeV2.isUserPrimeHolder(user1Address)).to.be.false;
      });

      it("should revert if user has no Prime token", async () => {
        const user1Address = await user1.getAddress();

        await expect(primeV2.burn(user1Address)).to.be.revertedWithCustomError(primeV2, "UserHasNoPrimeToken");
      });
    });

    describe("burnBatch", () => {
      it("should burn multiple Prime tokens", async () => {
        const user1Address = await user1.getAddress();
        const user2Address = await user2.getAddress();

        await primeV2.issueBatch([user1Address, user2Address]);
        expect(await primeV2.totalTokens()).to.equal(2);

        await expect(primeV2.burnBatch([user1Address, user2Address]))
          .to.emit(primeV2, "Burn")
          .withArgs(user1Address);

        expect(await primeV2.isUserPrimeHolder(user1Address)).to.be.false;
        expect(await primeV2.isUserPrimeHolder(user2Address)).to.be.false;
        expect(await primeV2.totalTokens()).to.equal(0);
      });

      it("should revert if any user has no Prime token", async () => {
        const user1Address = await user1.getAddress();
        const user2Address = await user2.getAddress();

        await primeV2.issueBatch([user1Address]);

        await expect(primeV2.burnBatch([user1Address, user2Address])).to.be.revertedWithCustomError(
          primeV2,
          "UserHasNoPrimeToken",
        );
      });

      it("should revert if caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(primeV2.burnBatch([await user1.getAddress()])).to.be.revertedWithCustomError(
          primeV2,
          "Unauthorized",
        );
      });
    });

    describe("setLimit", () => {
      it("should update limit", async () => {
        await expect(primeV2.setLimit(1000)).to.emit(primeV2, "MintLimitUpdated").withArgs(500, 1000);

        expect(await primeV2.tokenLimit()).to.equal(1000);
      });

      it("should revert if new limit less than current count", async () => {
        // Issue some tokens first
        await primeV2.issueBatch([await user1.getAddress()]);

        // Try to set limit below current count
        await expect(primeV2.setLimit(0)).to.be.revertedWithCustomError(primeV2, "InvalidLimit");
      });
    });

    describe("updateAlpha", () => {
      it("should update alpha parameters", async () => {
        await expect(primeV2.updateAlpha(2, 3)).to.emit(primeV2, "AlphaUpdated").withArgs(1, 2, 2, 3);

        expect(await primeV2.alphaNumerator()).to.equal(2);
        expect(await primeV2.alphaDenominator()).to.equal(3);
      });

      it("should revert with invalid alpha (numerator > denominator)", async () => {
        await expect(primeV2.updateAlpha(3, 2)).to.be.revertedWithCustomError(primeV2, "InvalidAlphaArguments");
      });

      it("should revert with zero denominator", async () => {
        await expect(primeV2.updateAlpha(1, 0)).to.be.revertedWithCustomError(primeV2, "InvalidAlphaArguments");
      });
    });

    describe("pause/unpause", () => {
      it("should pause and unpause", async () => {
        await primeV2.pause();
        expect(await primeV2.paused()).to.be.true;

        await primeV2.unpause();
        expect(await primeV2.paused()).to.be.false;
      });
    });

    describe("setMaxLoopsLimit", () => {
      it("should update max loops limit", async () => {
        await primeV2.setMaxLoopsLimit(200);
        expect(await primeV2.maxLoopsLimit()).to.equal(200);
      });
    });
  });

  describe("View Functions", () => {
    it("should return XVS balance of user", async () => {
      const user1Address = await user1.getAddress();
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(5000, 18), 0, 0]);

      const balance = await primeV2.xvsBalanceOfUser(user1Address);
      expect(balance).to.equal(convertToUnit(5000, 18));
    });

    it("should return XVS balance minus pending withdrawals", async () => {
      const user1Address = await user1.getAddress();
      xvsVault.getUserInfo
        .whenCalledWith(xvsAddress, 0, user1Address)
        .returns([convertToUnit(5000, 18), 0, convertToUnit(1000, 18)]);

      const balance = await primeV2.xvsBalanceOfUser(user1Address);
      expect(balance).to.equal(convertToUnit(4000, 18));
    });

    it("should return zero if pending withdrawals exceed balance", async () => {
      const user1Address = await user1.getAddress();
      xvsVault.getUserInfo
        .whenCalledWith(xvsAddress, 0, user1Address)
        .returns([convertToUnit(1000, 18), 0, convertToUnit(2000, 18)]);

      const balance = await primeV2.xvsBalanceOfUser(user1Address);
      expect(balance).to.equal(0);
    });

    it("should return all markets", async () => {
      const markets = await primeV2.getAllMarkets();
      expect(markets).to.be.an("array");
      expect(markets.length).to.equal(0); // No markets added yet
    });
  });

  describe("Token Limits", () => {
    it("should enforce token limit", async () => {
      // Set limit to 2
      await primeV2.setLimit(2);

      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();
      const user3Address = await user3.getAddress();

      // Issue 2 tokens (should succeed)
      await primeV2.issueBatch([user1Address, user2Address]);

      // Try to issue a 3rd (should fail)
      await expect(primeV2.issueBatch([user3Address])).to.be.revertedWithCustomError(primeV2, "InvalidLimit");
    });
  });

  describe("Market Management", () => {
    describe("addMarket", () => {
      beforeEach(() => {
        comptroller.markets.returns(true);
      });

      it("should add a market successfully", async () => {
        await expect(primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)))
          .to.emit(primeV2, "MarketAdded")
          .withArgs(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

        const allMarkets = await primeV2.getAllMarkets();
        expect(allMarkets).to.have.lengthOf(1);
        expect(allMarkets[0]).to.equal(vToken.address);

        const market = await primeV2.markets(vToken.address);
        expect(market.exists).to.be.true;
        expect(market.supplyMultiplier).to.equal(convertToUnit(2, 18));
        expect(market.borrowMultiplier).to.equal(convertToUnit(2, 18));
      });

      it("should revert when market already exists", async () => {
        await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

        await expect(
          primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)),
        ).to.be.revertedWithCustomError(primeV2, "MarketAlreadyExists");
      });

      it("should revert when both multipliers are zero", async () => {
        await expect(primeV2.addMarket(vToken.address, 0, 0)).to.be.revertedWithCustomError(
          primeV2,
          "InvalidMultipliers",
        );
      });

      it("should revert when market is not listed on comptroller", async () => {
        comptroller.markets.returns(false);

        await expect(
          primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)),
        ).to.be.revertedWithCustomError(primeV2, "InvalidVToken");
      });

      it("should revert when asset already has a market", async () => {
        await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

        // Create a second vToken with the same underlying
        const vToken2 = await smock.fake("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
        vToken2.underlying.returns(underlyingAddress); // Same underlying

        await expect(
          primeV2.addMarket(vToken2.address, convertToUnit(2, 18), convertToUnit(2, 18)),
        ).to.be.revertedWithCustomError(primeV2, "AssetAlreadyExists");
      });

      it("should queue score updates when market is added", async () => {
        await primeV2.issueBatch([await user1.getAddress()]);

        await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

        expect(await primeV2.pendingScoreUpdates()).to.equal(1);
      });

      it("should revert when caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(
          primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18)),
        ).to.be.revertedWithCustomError(primeV2, "Unauthorized");
      });
    });

    describe("removeMarket", () => {
      beforeEach(async () => {
        comptroller.markets.returns(true);
        await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      });

      it("should remove a market successfully", async () => {
        await expect(primeV2.removeMarket(vToken.address)).to.emit(primeV2, "MarketRemoved").withArgs(vToken.address);

        const allMarkets = await primeV2.getAllMarkets();
        expect(allMarkets).to.not.include(vToken.address);

        const market = await primeV2.markets(vToken.address);
        expect(market.exists).to.equal(false);
      });

      it("should revert when market does not exist", async () => {
        const nonExistentMarket = await user2.getAddress();
        await expect(primeV2.removeMarket(nonExistentMarket)).to.be.revertedWithCustomError(
          primeV2,
          "MarketNotSupported",
        );
      });

      it("should clear vTokenForAsset mapping", async () => {
        const underlying = await vToken.underlying();
        expect(await primeV2.vTokenForAsset(underlying)).to.equal(vToken.address);

        await primeV2.removeMarket(vToken.address);

        expect(await primeV2.vTokenForAsset(underlying)).to.equal(ethers.constants.AddressZero);
      });

      it("should queue score updates when market is removed", async () => {
        await primeV2.issueBatch([await user1.getAddress()]);

        await primeV2.removeMarket(vToken.address);

        expect(await primeV2.pendingScoreUpdates()).to.equal(1);
      });

      it("should revert when caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(primeV2.removeMarket(vToken.address)).to.be.revertedWithCustomError(primeV2, "Unauthorized");
      });

      it("should allow re-adding a removed market", async () => {
        await primeV2.removeMarket(vToken.address);

        await expect(primeV2.addMarket(vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)))
          .to.emit(primeV2, "MarketAdded")
          .withArgs(vToken.address, convertToUnit(3, 18), convertToUnit(3, 18));
      });

      it("should revert when market has active members with scores", async () => {
        const user1Address = await user1.getAddress();

        // Setup: user has supply and XVS staked so score > 0
        vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
        xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

        await primeV2["issue(address)"](user1Address);

        // Verify market has active score
        const market = await primeV2.markets(vToken.address);
        expect(market.sumOfMembersScore).to.be.gt(0);

        // Market now has sumOfMembersScore > 0
        await expect(primeV2.removeMarket(vToken.address)).to.be.revertedWithCustomError(
          primeV2,
          "MarketHasActiveMembers",
        );
      });

      it("should allow removal after all members are burned", async () => {
        const user1Address = await user1.getAddress();

        // Setup: user has supply and XVS staked so score > 0
        vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
        xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

        await primeV2["issue(address)"](user1Address);

        // Burn the user first (clears their score from sumOfMembersScore)
        await primeV2.burn(user1Address);

        // Now removal should succeed
        await expect(primeV2.removeMarket(vToken.address))
          .to.emit(primeV2, "MarketRemoved")
          .withArgs(vToken.address);
      });
    });

    describe("updateMultipliers", () => {
      beforeEach(async () => {
        await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      });

      it("should update market multipliers", async () => {
        await expect(primeV2.updateMultipliers(vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)))
          .to.emit(primeV2, "MultiplierUpdated")
          .withArgs(
            vToken.address,
            convertToUnit(2, 18),
            convertToUnit(2, 18),
            convertToUnit(3, 18),
            convertToUnit(3, 18),
          );

        const market = await primeV2.markets(vToken.address);
        expect(market.supplyMultiplier).to.equal(convertToUnit(3, 18));
        expect(market.borrowMultiplier).to.equal(convertToUnit(3, 18));
      });

      it("should revert for unsupported market", async () => {
        const fakeMarket = ethers.Wallet.createRandom().address;

        await expect(
          primeV2.updateMultipliers(fakeMarket, convertToUnit(3, 18), convertToUnit(3, 18)),
        ).to.be.revertedWithCustomError(primeV2, "MarketNotSupported");
      });

      it("should queue score updates after multiplier change", async () => {
        await primeV2.issueBatch([await user1.getAddress()]);

        // addMarket queued 0 updates (no tokens existed at that time), issue didn't add more
        expect(await primeV2.pendingScoreUpdates()).to.equal(0);

        await primeV2.updateMultipliers(vToken.address, convertToUnit(3, 18), convertToUnit(3, 18));
        expect(await primeV2.pendingScoreUpdates()).to.equal(1);
      });

      it("should revert when caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(
          primeV2.updateMultipliers(vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)),
        ).to.be.revertedWithCustomError(primeV2, "Unauthorized");
      });
    });
  });

  describe("Score Updates", () => {
    it("should queue score updates when alpha changes", async () => {
      // Issue some tokens first
      await primeV2.issueBatch([await user1.getAddress()]);

      const roundBefore = await primeV2.nextScoreUpdateRoundId();
      await primeV2.updateAlpha(2, 3);
      const roundAfter = await primeV2.nextScoreUpdateRoundId();

      expect(roundAfter).to.equal(roundBefore.add(1));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);
    });

    it("should revert updateScores if no pending updates", async () => {
      await expect(primeV2.updateScores([await user1.getAddress()])).to.be.revertedWithCustomError(
        primeV2,
        "NoScoreUpdatesRequired",
      );
    });

    it("should revert issue (single) when pendingScoreUpdates > 0", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      await primeV2["issue(address)"](user1Address);

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      await expect(primeV2["issue(address)"](user2Address)).to.be.revertedWithCustomError(
        primeV2,
        "ScoreUpdateInProgress",
      );
    });

    it("should revert issueBatch when pendingScoreUpdates > 0", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      await primeV2.issueBatch([user1Address]);

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      await expect(primeV2.issueBatch([user2Address])).to.be.revertedWithCustomError(primeV2, "ScoreUpdateInProgress");
    });

    it("should revert burn when pendingScoreUpdates > 0", async () => {
      const user1Address = await user1.getAddress();

      await primeV2.issueBatch([user1Address]);

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      await expect(primeV2.burn(user1Address)).to.be.revertedWithCustomError(primeV2, "ScoreUpdateInProgress");
    });

    it("should revert burnBatch when pendingScoreUpdates > 0", async () => {
      const user1Address = await user1.getAddress();

      await primeV2.issueBatch([user1Address]);

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      await expect(primeV2.burnBatch([user1Address])).to.be.revertedWithCustomError(primeV2, "ScoreUpdateInProgress");
    });

    it("should complete a score update round", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      // Setup: add market, issue tokens, give users supply
      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      vToken.balanceOf.whenCalledWith(user2Address).returns(convertToUnit(500, 18));
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user2Address).returns([convertToUnit(1000, 18), 0, 0]);

      await primeV2.issueBatch([user1Address, user2Address]);

      // Trigger score update round via alpha change
      await primeV2.updateAlpha(2, 3);
      expect(await primeV2.pendingScoreUpdates()).to.equal(2);

      // Complete the round
      await primeV2.updateScores([user1Address, user2Address]);
      expect(await primeV2.pendingScoreUpdates()).to.equal(0);
    });

    it("should skip non-holders in updateScores", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      await primeV2["issue(address)"](user1Address);

      // Trigger score update round
      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      // Pass non-holder user2 — should skip, not revert, but also not decrement
      await primeV2.updateScores([user2Address]);
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      // Pass actual holder — should decrement
      await primeV2.updateScores([user1Address]);
      expect(await primeV2.pendingScoreUpdates()).to.equal(0);
    });

    it("should skip already-updated users in the same round", async () => {
      const user1Address = await user1.getAddress();

      await primeV2["issue(address)"](user1Address);

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      // Update user1's score
      await primeV2.updateScores([user1Address]);
      expect(await primeV2.pendingScoreUpdates()).to.equal(0);

      // Trigger another round so updateScores doesn't revert with NoScoreUpdatesRequired
      await primeV2.updateAlpha(2, 3);
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      // Update user1 again in the new round — should work
      await primeV2.updateScores([user1Address]);
      expect(await primeV2.pendingScoreUpdates()).to.equal(0);
    });

    it("should emit IncompleteRoundDiscarded when a new round starts before completion", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await primeV2.issueBatch([user1Address, user2Address]);

      // Start first round
      await primeV2.updateAlpha(2, 3);
      const roundId = await primeV2.nextScoreUpdateRoundId();
      expect(await primeV2.pendingScoreUpdates()).to.equal(2);

      // Only update user1 (leave 1 pending)
      await primeV2.updateScores([user1Address]);
      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      // Start a new round before completing — should discard the old one
      await expect(primeV2.updateMultipliers(vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)))
        .to.emit(primeV2, "IncompleteRoundDiscarded")
        .withArgs(roundId, 1);
    });

    it("should update score values after updateScores", async () => {
      const user1Address = await user1.getAddress();

      // Reset PLP mock to prevent leaked state from prior tests
      primeLiquidityProvider.tokenAmountAccrued.returns(0);

      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      // Use different XVS and supply values so alpha change produces a different score
      vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(500, 18));
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(2000, 18), 0, 0]);

      await primeV2["issue(address)"](user1Address);

      const interestBefore = await primeV2.interests(vToken.address, user1Address);
      const scoreBefore = interestBefore.score;
      expect(scoreBefore).to.be.gt(0);

      // Change alpha to trigger score recalculation (1/2 → 1/3 is a significant change)
      await primeV2.updateAlpha(1, 3);

      // Update the score
      await primeV2.updateScores([user1Address]);

      const interestAfter = await primeV2.interests(vToken.address, user1Address);
      // Score should have changed due to different alpha
      expect(interestAfter.score).to.not.equal(scoreBefore);
    });
  });

  describe("Interest Accrual and Claiming", () => {
    let user1Address: string;

    beforeEach(async () => {
      user1Address = await user1.getAddress();

      // Reset PLP mock — smock state persists across loadFixture EVM reverts
      primeLiquidityProvider.tokenAmountAccrued.returns(0);

      // Setup: add market, issue token, give user supply
      comptroller.markets.returns(true);
      await primeV2.addMarket(vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

      vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

      await primeV2["issue(address)"](user1Address);
    });

    it("should accrue interest and update rewardIndex", async () => {
      const marketBefore = await primeV2.markets(vToken.address);
      expect(marketBefore.rewardIndex).to.equal(0);

      // PLP has accrued 100 tokens of income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      await primeV2.accrueInterest(vToken.address);

      const marketAfter = await primeV2.markets(vToken.address);
      expect(marketAfter.rewardIndex).to.be.gt(0);
    });

    it("should not increase rewardIndex when no new income accrued", async () => {
      // First accrue with some income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await primeV2.accrueInterest(vToken.address);

      const marketBefore = await primeV2.markets(vToken.address);

      // Second accrue with same amount (no new income delta)
      await primeV2.accrueInterest(vToken.address);

      const marketAfter = await primeV2.markets(vToken.address);
      expect(marketAfter.rewardIndex).to.equal(marketBefore.rewardIndex);
    });

    it("should revert accrueInterest for unsupported market", async () => {
      const fakeMarket = ethers.Wallet.createRandom().address;
      await expect(primeV2.accrueInterest(fakeMarket)).to.be.revertedWithCustomError(primeV2, "MarketNotSupported");
    });

    it("should claim interest and transfer tokens to user", async () => {
      // PLP accrues income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      // Accrue and boost to confirm interest accrual works
      await primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, vToken.address);

      const interest = await primeV2.interests(vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);

      // PrimeV2 has enough balance to pay
      underlyingToken.balanceOf.whenCalledWith(primeV2.address).returns(convertToUnit(200, 18));
      underlyingToken.transfer.returns(true);

      const tx = primeV2.connect(user1)["claimInterest(address)"](vToken.address);
      await expect(tx).to.emit(primeV2, "InterestClaimed");
    });

    it("should return zero when non-holder has no accrued interest", async () => {
      const user2Address = await user2.getAddress();

      // user2 is not a prime holder, no accrued interest
      const rewards = await primeV2.getPendingRewardsStatic(user2Address);
      expect(rewards[0].amount).to.equal(0);
    });

    it("should revert claimInterest for unsupported market", async () => {
      const fakeMarket = ethers.Wallet.createRandom().address;
      await expect(
        primeV2.connect(user1)["claimInterest(address)"](fakeMarket),
      ).to.be.revertedWithCustomError(primeV2, "MarketNotSupported");
    });

    it("should revert claimInterest when paused", async () => {
      await primeV2.pause();

      await expect(primeV2.connect(user1)["claimInterest(address)"](vToken.address)).to.be.revertedWith(
        "Pausable: paused",
      );
    });

    it("should allow burned user to claim residual accrued interest", async () => {
      // PLP accrues income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      // Accrue interest and boost to move pending interest into accrued
      await primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, vToken.address);

      const interestBefore = await primeV2.interests(vToken.address, user1Address);
      expect(interestBefore.accrued).to.be.gt(0);

      // Burn user's prime token — _burnWithoutAccrual also calls _executeBoostWithoutAccrual
      // which preserves the accrued amount
      await primeV2.burn(user1Address);
      expect(await primeV2.isUserPrimeHolder(user1Address)).to.be.false;

      // Verify accrued interest survived the burn
      const interestAfterBurn = await primeV2.interests(vToken.address, user1Address);
      expect(interestAfterBurn.accrued).to.be.gt(0);

      // Burned user should still be able to claim residual accrued interest
      underlyingToken.balanceOf.whenCalledWith(primeV2.address).returns(convertToUnit(200, 18));
      underlyingToken.transfer.returns(true);

      await expect(primeV2.connect(user1)["claimInterest(address)"](vToken.address)).to.emit(
        primeV2,
        "InterestClaimed",
      );
    });

    it("should accrue interest and update score for a single market", async () => {
      // PLP accrues income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      const interestBefore = await primeV2.interests(vToken.address, user1Address);
      expect(interestBefore.accrued).to.equal(0);

      await primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, vToken.address);

      const interestAfter = await primeV2.interests(vToken.address, user1Address);
      // Accrued should now have the pending interest
      expect(interestAfter.accrued).to.be.gt(0);
    });

    it("should accrue interest and update score across all markets", async () => {
      // PLP accrues income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      await primeV2["accrueInterestAndUpdateScore(address)"](user1Address);

      const interest = await primeV2.interests(vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);
    });

    it("should return pending rewards via getPendingRewardsStatic", async () => {
      // PLP accrues income
      primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      // Accrue interest to update rewardIndex
      await primeV2.accrueInterest(vToken.address);

      // Execute boost to record accrued interest for user
      await primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, vToken.address);

      const interest = await primeV2.interests(vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);

      const rewards = await primeV2.getPendingRewardsStatic(user1Address);
      expect(rewards.length).to.equal(1);
      expect(rewards[0].vToken).to.equal(vToken.address);
      expect(rewards[0].rewardToken).to.equal(underlyingAddress);
      expect(rewards[0].amount).to.be.gt(0);
    });
  });
});
