import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { BLOCKS_PER_YEAR, PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2 - Initialization", () => {
  let f: PrimeV2Fixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should initialize with correct values", async () => {
    expect(await f.primeV2.xvsVault()).to.equal(f.xvsVault.address);
    expect(await f.primeV2.xvsVaultRewardToken()).to.equal(f.xvsAddress);
    expect(await f.primeV2.xvsVaultPoolId()).to.equal(0);
    expect(await f.primeV2.alphaNumerator()).to.equal(1);
    expect(await f.primeV2.alphaDenominator()).to.equal(2);
    expect(await f.primeV2.primeLiquidityProvider()).to.equal(f.primeLiquidityProvider.address);
    expect(await f.primeV2.corePoolComptroller()).to.equal(f.comptrollerAddress);
  });

  it("should set default limit", async () => {
    expect(await f.primeV2.tokenLimit()).to.equal(500);
  });

  it("should revert if initialized twice", async () => {
    await expect(
      f.primeV2.initialize(
        1,
        2,
        f.accessControlManager.address,
        f.primeLiquidityProvider.address,
        f.comptrollerAddress,
        f.oracle.address,
        100,
      ),
    ).to.be.revertedWith("Initializable: contract is already initialized");
  });

  it("should revert with zero xvsVault address in constructor", async () => {
    const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");

    await expect(
      upgrades.deployProxy(
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
          constructorArgs: [
            f.wrappedNativeToken,
            f.nativeMarket,
            ethers.constants.AddressZero,
            f.xvsAddress,
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

    await expect(
      upgrades.deployProxy(
        PrimeV2Factory,
        [
          3,
          2,
          f.accessControlManager.address,
          f.primeLiquidityProvider.address,
          f.comptrollerAddress,
          f.oracle.address,
          100,
        ],
        {
          constructorArgs: [
            f.wrappedNativeToken,
            f.nativeMarket,
            f.xvsVault.address,
            f.xvsAddress,
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
