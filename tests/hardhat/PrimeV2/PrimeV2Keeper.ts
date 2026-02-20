import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { IAccessControlManagerV8, IPrimeLeaderboard, IPrimeV2, PrimeV2Keeper } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2Keeper", () => {
  let keeper: PrimeV2Keeper;
  let accessControlManager: FakeContract<IAccessControlManagerV8>;
  let primeV2: FakeContract<IPrimeV2>;
  let primeLeaderboard: FakeContract<IPrimeLeaderboard>;
  let admin: Signer;
  let user1: Signer;
  let user2: Signer;

  const BATCH_SIZE = 10;
  const LOOPS_LIMIT = 100;

  const deployFixture = async () => {
    [admin, user1, user2] = await ethers.getSigners();

    accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
    accessControlManager.isAllowedToCall.returns(true);

    primeV2 = await smock.fake<IPrimeV2>("contracts/Tokens/Prime/PrimeV2Keeper.sol:IPrimeV2");
    primeLeaderboard = await smock.fake<IPrimeLeaderboard>(
      "contracts/Tokens/Prime/IPrimeLeaderboard.sol:IPrimeLeaderboard",
    );

    // Default mock returns
    primeV2.pendingScoreUpdates.returns(0);
    primeV2.getAllMarkets.returns([]);

    const KeeperFactory = await ethers.getContractFactory("PrimeV2Keeper");
    keeper = (await upgrades.deployProxy(
      KeeperFactory,
      [accessControlManager.address, primeV2.address, primeLeaderboard.address, BATCH_SIZE, LOOPS_LIMIT],
      {
        unsafeAllow: ["constructor"],
      },
    )) as PrimeV2Keeper;

    return {
      keeper,
      accessControlManager,
      primeV2,
      primeLeaderboard,
      admin,
      user1,
      user2,
    };
  };

  beforeEach(async () => {
    ({ keeper, accessControlManager, primeV2, primeLeaderboard, admin, user1, user2 } =
      await loadFixture(deployFixture));

    // Reset mock state (smock state isn't part of EVM snapshot)
    accessControlManager.isAllowedToCall.returns(true);
  });

  describe("Initialization", () => {
    it("should initialize with correct values", async () => {
      expect(await keeper.primeV2()).to.equal(primeV2.address);
      expect(await keeper.primeLeaderboard()).to.equal(primeLeaderboard.address);
      expect(await keeper.batchSize()).to.equal(BATCH_SIZE);
    });

    it("should revert if initialized twice", async () => {
      await expect(
        keeper.initialize(
          accessControlManager.address,
          primeV2.address,
          primeLeaderboard.address,
          BATCH_SIZE,
          LOOPS_LIMIT,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should revert with zero primeV2 address", async () => {
      const KeeperFactory = await ethers.getContractFactory("PrimeV2Keeper");
      await expect(
        upgrades.deployProxy(
          KeeperFactory,
          [
            accessControlManager.address,
            ethers.constants.AddressZero,
            primeLeaderboard.address,
            BATCH_SIZE,
            LOOPS_LIMIT,
          ],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(KeeperFactory, "InvalidAddress");
    });

    it("should revert with zero primeLeaderboard address", async () => {
      const KeeperFactory = await ethers.getContractFactory("PrimeV2Keeper");
      await expect(
        upgrades.deployProxy(
          KeeperFactory,
          [accessControlManager.address, primeV2.address, ethers.constants.AddressZero, BATCH_SIZE, LOOPS_LIMIT],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(KeeperFactory, "InvalidAddress");
    });

    it("should revert with zero batch size", async () => {
      const KeeperFactory = await ethers.getContractFactory("PrimeV2Keeper");
      await expect(
        upgrades.deployProxy(
          KeeperFactory,
          [accessControlManager.address, primeV2.address, primeLeaderboard.address, 0, LOOPS_LIMIT],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(KeeperFactory, "InvalidBatchSize");
    });
  });

  describe("processScoreUpdates", () => {
    it("should call updateScores on PrimeV2", async () => {
      const user1Address = await user1.getAddress();
      const users = [user1Address];

      await keeper.processScoreUpdates(users);

      expect(primeV2.updateScores).to.have.been.calledWith(users);
    });

    it("should emit ScoreUpdatesProcessed event", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();
      const users = [user1Address, user2Address];

      await expect(keeper.processScoreUpdates(users)).to.emit(keeper, "ScoreUpdatesProcessed").withArgs(2);
    });

    it("should revert when users array exceeds batch size", async () => {
      // Create array larger than batch size
      const users: string[] = [];
      for (let i = 0; i < BATCH_SIZE + 1; i++) {
        users.push(ethers.Wallet.createRandom().address);
      }

      await expect(keeper.processScoreUpdates(users)).to.be.revertedWithCustomError(keeper, "InvalidBatchSize");
    });

    it("should accept exactly batch size users", async () => {
      const users: string[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        users.push(ethers.Wallet.createRandom().address);
      }

      await expect(keeper.processScoreUpdates(users)).to.emit(keeper, "ScoreUpdatesProcessed").withArgs(BATCH_SIZE);
    });

    it("should revert when caller not authorized", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(keeper.processScoreUpdates([await user1.getAddress()])).to.be.revertedWithCustomError(
        keeper,
        "Unauthorized",
      );
    });
  });

  describe("accrueAllMarkets", () => {
    it("should call accrueInterest on each market", async () => {
      const market1 = ethers.Wallet.createRandom().address;
      const market2 = ethers.Wallet.createRandom().address;
      const market3 = ethers.Wallet.createRandom().address;
      primeV2.getAllMarkets.returns([market1, market2, market3]);

      await keeper.accrueAllMarkets();

      expect(primeV2.accrueInterest).to.have.been.calledWith(market1);
      expect(primeV2.accrueInterest).to.have.been.calledWith(market2);
      expect(primeV2.accrueInterest).to.have.been.calledWith(market3);
    });

    it("should emit AllMarketsAccrued event", async () => {
      const market1 = ethers.Wallet.createRandom().address;
      const market2 = ethers.Wallet.createRandom().address;
      primeV2.getAllMarkets.returns([market1, market2]);

      await expect(keeper.accrueAllMarkets()).to.emit(keeper, "AllMarketsAccrued").withArgs(2);
    });

    it("should work with zero markets", async () => {
      primeV2.getAllMarkets.returns([]);

      await expect(keeper.accrueAllMarkets()).to.emit(keeper, "AllMarketsAccrued").withArgs(0);
    });

    it("should revert when caller not authorized", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(keeper.accrueAllMarkets()).to.be.revertedWithCustomError(keeper, "Unauthorized");
    });
  });

  describe("getPendingScoreUpdates", () => {
    it("should return pending score updates from PrimeV2", async () => {
      primeV2.pendingScoreUpdates.returns(5);

      expect(await keeper.getPendingScoreUpdates()).to.equal(5);
    });

    it("should return zero when no pending updates", async () => {
      primeV2.pendingScoreUpdates.returns(0);

      expect(await keeper.getPendingScoreUpdates()).to.equal(0);
    });
  });

  describe("Admin Functions", () => {
    describe("setBatchSize", () => {
      it("should update batch size", async () => {
        await expect(keeper.setBatchSize(20)).to.emit(keeper, "BatchSizeUpdated").withArgs(BATCH_SIZE, 20);

        expect(await keeper.batchSize()).to.equal(20);
      });

      it("should revert with zero batch size", async () => {
        await expect(keeper.setBatchSize(0)).to.be.revertedWithCustomError(keeper, "InvalidBatchSize");
      });

      it("should revert when caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(keeper.setBatchSize(20)).to.be.revertedWithCustomError(keeper, "Unauthorized");
      });
    });

    describe("setContracts", () => {
      it("should update contract references", async () => {
        const newPrimeV2 = ethers.Wallet.createRandom().address;
        const newLeaderboard = ethers.Wallet.createRandom().address;

        await expect(keeper.setContracts(newPrimeV2, newLeaderboard))
          .to.emit(keeper, "ContractsUpdated")
          .withArgs(newPrimeV2, newLeaderboard);

        expect(await keeper.primeV2()).to.equal(newPrimeV2);
        expect(await keeper.primeLeaderboard()).to.equal(newLeaderboard);
      });

      it("should revert with zero primeV2 address", async () => {
        await expect(
          keeper.setContracts(ethers.constants.AddressZero, primeLeaderboard.address),
        ).to.be.revertedWithCustomError(keeper, "InvalidAddress");
      });

      it("should revert with zero primeLeaderboard address", async () => {
        await expect(keeper.setContracts(primeV2.address, ethers.constants.AddressZero)).to.be.revertedWithCustomError(
          keeper,
          "InvalidAddress",
        );
      });

      it("should revert when caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        const newPrimeV2 = ethers.Wallet.createRandom().address;
        const newLeaderboard = ethers.Wallet.createRandom().address;

        await expect(keeper.setContracts(newPrimeV2, newLeaderboard)).to.be.revertedWithCustomError(
          keeper,
          "Unauthorized",
        );
      });
    });

    describe("setMaxLoopsLimit", () => {
      it("should update max loops limit", async () => {
        await expect(keeper.setMaxLoopsLimit(200)).to.emit(keeper, "MaxLoopsLimitUpdated").withArgs(LOOPS_LIMIT, 200);
      });

      it("should revert when caller not authorized", async () => {
        accessControlManager.isAllowedToCall.returns(false);

        await expect(keeper.setMaxLoopsLimit(200)).to.be.revertedWithCustomError(keeper, "Unauthorized");
      });
    });
  });
});
