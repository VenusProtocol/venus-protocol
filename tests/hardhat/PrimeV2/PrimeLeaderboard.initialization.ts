import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { DAY, PrimeLeaderboardFixture, deployPrimeLeaderboardFixture } from "./helpers/primeLeaderboardFixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeLeaderboard - Initialization", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should initialize with correct values", async () => {
    expect(await f.primeLeaderboard.xvsVault()).to.equal(f.xvsVault.address);
    expect(await f.primeLeaderboard.xvsVaultRewardToken()).to.equal(f.xvsAddress);
    expect(await f.primeLeaderboard.xvsVaultPoolId()).to.equal(0);
  });

  it("should initialize with default multiplier tiers", async () => {
    const [durations, multipliers] = await f.primeLeaderboard.getMultiplierTiers();

    expect(durations.length).to.equal(3);
    expect(durations[0]).to.equal(30 * DAY);
    expect(durations[1]).to.equal(60 * DAY);
    expect(durations[2]).to.equal(90 * DAY);

    expect(multipliers[0]).to.equal(convertToUnit("1.3", 18));
    expect(multipliers[1]).to.equal(convertToUnit("1.6", 18));
    expect(multipliers[2]).to.equal(convertToUnit("2", 18));
  });

  it("should revert if initialized twice", async () => {
    await expect(f.primeLeaderboard.initialize(f.accessControlManager.address, 100)).to.be.revertedWith(
      "Initializable: contract is already initialized",
    );
  });

  it("should revert with zero xvsVault address in constructor", async () => {
    const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

    await expect(
      upgrades.deployProxy(PrimeLeaderboardFactory, [f.accessControlManager.address, 100], {
        unsafeAllow: ["constructor", "state-variable-immutable"],
        constructorArgs: [ethers.constants.AddressZero, f.xvsAddress, 0],
      }),
    ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
  });

  it("should revert with zero xvsVaultRewardToken address in constructor", async () => {
    const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

    await expect(
      upgrades.deployProxy(PrimeLeaderboardFactory, [f.accessControlManager.address, 100], {
        unsafeAllow: ["constructor", "state-variable-immutable"],
        constructorArgs: [f.xvsVault.address, ethers.constants.AddressZero, 0],
      }),
    ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
  });
});
