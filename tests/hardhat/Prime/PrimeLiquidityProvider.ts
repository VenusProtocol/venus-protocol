import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { DEFAULT_BLOCKS_PER_YEAR } from "../../../helpers/deploymentConfig";
import { convertToUnit } from "../../../helpers/utils";
import {
  FaucetToken,
  FaucetToken__factory,
  IAccessControlManagerV5,
  Prime,
  PrimeLiquidityProvider,
} from "../../../typechain";

let primeLiquidityProvider: MockContract<PrimeLiquidityProvider>;
let tokenA: MockContract<FaucetToken>;
let tokenB: MockContract<FaucetToken>;
let tokenC: MockContract<FaucetToken>;
let prime: FakeContract<Prime>;
let accessControl: FakeContract<IAccessControlManagerV5>;
let signer: ethers.signer;
let signers: ethers.signers;

const tokenASpeed = parseUnits("1", 16);
const tokenBSpeed = parseUnits("2", 16);
const tokenCSpeed = parseUnits("3", 16);
const tokenAInitialFund = parseUnits("100", 18);
const tokenBInitialFund = parseUnits("200", 18);

const fixture = async () => {
  signers = await ethers.getSigners();
  signer = signers[0];

  const FaucetToken = await smock.mock<FaucetToken__factory>("FaucetToken");

  prime = await smock.fake<Prime>("Prime");
  accessControl = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  tokenA = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENA", 18, "A");
  tokenB = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENB", 18, "B");
  tokenC = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENC", 18, "C");

  const PrimeLiquidityProvider = await ethers.getContractFactory("PrimeLiquidityProvider");
  primeLiquidityProvider = await upgrades.deployProxy(
    PrimeLiquidityProvider,
    [
      accessControl.address,
      [tokenA.address, tokenB.address],
      [tokenASpeed, tokenBSpeed],
      [convertToUnit(1, 18), convertToUnit(1, 18)],
      10,
    ],
    {
      constructorArgs: [false, DEFAULT_BLOCKS_PER_YEAR],
      // To allow the usage constructor & internal functions that might change storage
      unsafeAllow: ["constructor", "internal-function-storage"],
    },
  );

  await primeLiquidityProvider.setPrimeToken(prime.address);
};

describe("PrimeLiquidityProvider: tests", () => {
  beforeEach(async () => {
    await loadFixture(fixture);
  });

  describe("Testing all initalized values", () => {
    it("Tokens intialized", async () => {
      const tokenABlockOrSecond = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenA.address);
      expect(tokenABlockOrSecond).to.greaterThan(0);

      const tokenBBlockOrSecond = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenB.address);
      expect(tokenBBlockOrSecond).to.greaterThan(0);
    });

    it("Distribution Speed", async () => {
      const tokenASpeed_ = await primeLiquidityProvider.tokenDistributionSpeeds(tokenA.address);
      expect(tokenASpeed_).to.equal(tokenASpeed);

      const tokenBSpeed_ = await primeLiquidityProvider.tokenDistributionSpeeds(tokenB.address);
      expect(tokenBSpeed_).to.equal(tokenBSpeed);
    });
  });

  describe("Testing all setters", () => {
    beforeEach(async () => {
      await accessControl.isAllowedToCall.returns(true);
    });

    it("Revert on invalid args for initializeTokens", async () => {
      const tx = primeLiquidityProvider.initializeTokens([ethers.constants.AddressZero]);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidArguments");
    });

    it("Revert on re-intializing token", async () => {
      const tx = primeLiquidityProvider.initializeTokens([tokenA.address]);

      await expect(tx)
        .to.be.revertedWithCustomError(primeLiquidityProvider, "TokenAlreadyInitialized")
        .withArgs(tokenA.address);
    });

    it("initializeTokens success", async () => {
      const tx = await primeLiquidityProvider.initializeTokens([tokenC.address]);
      await tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "TokenDistributionInitialized").withArgs(tokenC.address);
    });

    it("pauseFundsTransfer", async () => {
      const tx = await primeLiquidityProvider.pauseFundsTransfer();
      await tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "Paused").withArgs(signer.address);

      expect(await primeLiquidityProvider.paused()).to.equal(true);
    });

    it("resumeFundsTransfer", async () => {
      await primeLiquidityProvider.pauseFundsTransfer();
      const tx = await primeLiquidityProvider.resumeFundsTransfer();
      await tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "Unpaused").withArgs(signer.address);

      expect(await primeLiquidityProvider.paused()).to.equal(false);
    });

    it("Revert on invalid args for setTokensDistributionSpeed", async () => {
      const tx = primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], []);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidArguments");
    });

    it("Revert on non initialized token", async () => {
      await expect(
        primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [tokenCSpeed]),
      ).to.be.revertedWithCustomError(primeLiquidityProvider, "TokenNotInitialized");
    });

    it("Revert on invalid distribution speed for setTokensDistributionSpeed", async () => {
      const maxDistributionSpeed = convertToUnit(1, 18);
      const speedMoreThanMaxSpeed = convertToUnit(1, 19);

      await primeLiquidityProvider.setMaxTokensDistributionSpeed([tokenC.address], [maxDistributionSpeed]);
      await primeLiquidityProvider.initializeTokens([tokenC.address]);
      const tx = primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [convertToUnit(1, 19)]);

      await expect(tx)
        .to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidDistributionSpeed")
        .withArgs(speedMoreThanMaxSpeed, maxDistributionSpeed);
    });

    it("setTokensDistributionSpeed success with default max speed", async () => {
      const defaultMaxSpeed = convertToUnit(1, 18);
      await primeLiquidityProvider.initializeTokens([tokenC.address]);
      const tx = await primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [tokenCSpeed]);
      await tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "TokenDistributionSpeedUpdated")
        .withArgs(tokenC.address, 0, tokenCSpeed);
      expect(await primeLiquidityProvider.maxTokenDistributionSpeeds(tokenC.address)).to.be.equal(defaultMaxSpeed);
    });

    it("setTokensDistributionSpeed success", async () => {
      await primeLiquidityProvider.initializeTokens([tokenC.address]);
      await primeLiquidityProvider.setMaxTokensDistributionSpeed([tokenC.address], [convertToUnit(1, 18)]);
      const tx = await primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [tokenCSpeed]);
      await tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "TokenDistributionSpeedUpdated")
        .withArgs(tokenC.address, 0, tokenCSpeed);
    });

    it("setMaxTokensDistributionSpeed success", async () => {
      const tx = await primeLiquidityProvider.setMaxTokensDistributionSpeed([tokenC.address], [tokenCSpeed]);
      await tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "MaxTokenDistributionSpeedUpdated")
        .withArgs(tokenC.address, 0, tokenCSpeed);
    });

    it("Reverts on setting prime address same as previous", async () => {
      const tx = primeLiquidityProvider.setPrimeToken(prime.address);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "AddressesMustDiffer");
    });

    it("Revert on invalid prime token address", async () => {
      const tx = primeLiquidityProvider.setPrimeToken(ethers.constants.AddressZero);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidArguments");
    });

    it("Revert when prime token setter is called by non-owner", async () => {
      const tx = primeLiquidityProvider.connect(signers[1]).setPrimeToken(prime.address);

      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setPrimeToken success", async () => {
      const tx = await primeLiquidityProvider.setPrimeToken(signers[2].address);
      await tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "PrimeTokenUpdated").withArgs(prime.address, signers[2].address);
    });

    it("Revert when maxLoopsLimit setter is called by non-owner", async () => {
      await accessControl.isAllowedToCall.returns(false);

      const tx = primeLiquidityProvider.setMaxLoopsLimit(11);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "Unauthorized");
    });

    it("Revert when new loops limit is less than old limit", async () => {
      const tx = primeLiquidityProvider.setMaxLoopsLimit(9);

      await expect(tx).to.be.revertedWith("Comptroller: Invalid maxLoopsLimit");
    });

    it("maxLoopsLimit setter success", async () => {
      const tx = await primeLiquidityProvider.setMaxLoopsLimit(11);
      await tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "MaxLoopsLimitUpdated").withArgs(10, 11);
      expect(await primeLiquidityProvider.maxLoopsLimit()).to.be.equal(11);
    });
  });

  describe("Accrue tokens", () => {
    beforeEach(async () => {
      await accessControl.isAllowedToCall.returns(true);

      await tokenA.transfer(primeLiquidityProvider.address, tokenAInitialFund);
      await tokenB.transfer(primeLiquidityProvider.address, tokenBInitialFund);
    });

    it("Revert on non initialized token", async () => {
      await expect(primeLiquidityProvider.accrueTokens(tokenC.address)).to.be.revertedWithCustomError(
        primeLiquidityProvider,
        "TokenNotInitialized",
      );
    });

    it("Accrue amount for tokenA", async () => {
      await mine(10);

      const lastAccruedBlockOrSecond = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      const currentBlockOrTimestamp = await primeLiquidityProvider.getBlockNumberOrTimestamp();

      const balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      const deltaBlocksOrTimestamp = Number(currentBlockOrTimestamp) - Number(lastAccruedBlockOrSecond);
      const accrued = deltaBlocksOrTimestamp * Number(tokenASpeed);

      expect(Number(balanceA)).to.equal(accrued);
    });

    it("Accrue amount for multiple tokens", async () => {
      await mine(10);

      let lastAccruedBlockOrSecondTokenA = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      let currentBlockOrTimestampTokenA = await primeLiquidityProvider.getBlockNumberOrTimestamp();

      await mine(10);

      let balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      let deltaBlocksOrSecondsTokenA = Number(currentBlockOrTimestampTokenA) - Number(lastAccruedBlockOrSecondTokenA);
      let accruedTokenA = deltaBlocksOrSecondsTokenA * Number(tokenASpeed);

      let balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(Number(balanceA)).to.equal(accruedTokenA);
      // accrueTokens is not called for tokenB yet i.e. no amount is accrued
      expect(Number(balanceB)).to.equal(0);

      let previousAccruedTokenA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      lastAccruedBlockOrSecondTokenA = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      currentBlockOrTimestampTokenA = await primeLiquidityProvider.getBlockNumberOrTimestamp();

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      deltaBlocksOrSecondsTokenA = Number(currentBlockOrTimestampTokenA) - Number(lastAccruedBlockOrSecondTokenA);
      accruedTokenA = deltaBlocksOrSecondsTokenA * Number(tokenASpeed);
      let totalAccruedTokenA = Number(previousAccruedTokenA) + accruedTokenA;

      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(Number(balanceA)).to.equal(totalAccruedTokenA);
      // accrueTokens is not called for tokenB yet i.e. no amount is accrued
      expect(balanceB).to.equal(0);

      await mine(10);
      let lastAccruedBlockOrSecondTokenB = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenB.address);
      await primeLiquidityProvider.accrueTokens(tokenB.address);
      let currentBlockOrTimestampTokenB = await primeLiquidityProvider.getBlockNumberOrTimestamp();
      let deltaBlocksOrSecondsTokenB = Number(currentBlockOrTimestampTokenB) - Number(lastAccruedBlockOrSecondTokenB);
      let accruedTokenB = deltaBlocksOrSecondsTokenB * Number(tokenBSpeed);

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      // accrueTokens is not called again for token B
      expect(Number(balanceA)).to.equal(totalAccruedTokenA);
      expect(Number(balanceB)).to.equal(accruedTokenB);

      previousAccruedTokenA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      lastAccruedBlockOrSecondTokenA = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      currentBlockOrTimestampTokenA = await primeLiquidityProvider.getBlockNumberOrTimestamp();

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      deltaBlocksOrSecondsTokenA = Number(currentBlockOrTimestampTokenA) - Number(lastAccruedBlockOrSecondTokenA);
      accruedTokenA = deltaBlocksOrSecondsTokenA * Number(tokenASpeed);
      totalAccruedTokenA = Number(previousAccruedTokenA) + accruedTokenA;

      const previousAccruedTokenB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);
      lastAccruedBlockOrSecondTokenB = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenB.address);
      await primeLiquidityProvider.accrueTokens(tokenB.address);
      currentBlockOrTimestampTokenB = await primeLiquidityProvider.getBlockNumberOrTimestamp();
      deltaBlocksOrSecondsTokenB = Number(currentBlockOrTimestampTokenB) - Number(lastAccruedBlockOrSecondTokenB);
      accruedTokenB = deltaBlocksOrSecondsTokenB * Number(tokenBSpeed);
      const totalAccruedTokenB = Number(previousAccruedTokenB) + accruedTokenB;

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(Number(balanceA)).to.equal(totalAccruedTokenA);
      expect(Number(balanceB)).to.equal(totalAccruedTokenB);

      await mine(10);

      await primeLiquidityProvider.initializeTokens([tokenC.address]);
      await primeLiquidityProvider.accrueTokens(tokenC.address);
      const balanceC = await primeLiquidityProvider.tokenAmountAccrued(tokenC.address);

      // No funds are transferred to primeLiquidityProvider for tokenC
      expect(balanceC).to.equal(0);
    });
  });

  describe("Release funds to prime contract", () => {
    beforeEach(async () => {
      await accessControl.isAllowedToCall.returns(true);

      await tokenA.transfer(primeLiquidityProvider.address, tokenAInitialFund);
      await tokenB.transfer(primeLiquidityProvider.address, tokenBInitialFund);

      // setting initial balance as while deploying the contract there was no funds allocated to primeLiquidityProvider

      await mine(10);
    });

    it("Revert on funds transfer Paused", async () => {
      const [wallet] = await ethers.getSigners();
      await primeLiquidityProvider.pauseFundsTransfer();

      await impersonateAccount(prime.address);
      const primeSigner = await ethers.provider.getSigner(prime.address);
      await wallet.sendTransaction({ to: prime.address, value: ethers.utils.parseEther("10") });

      const tx = primeLiquidityProvider.connect(primeSigner).releaseFunds(tokenA.address);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "FundsTransferIsPaused");
    });

    it("Revert on invalid caller", async () => {
      const tx = primeLiquidityProvider.releaseFunds(tokenA.address);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidCaller");
    });

    it("Release funds success", async () => {
      const [wallet] = await ethers.getSigners();

      const lastAccruedBlockOrSecondTokenA = await primeLiquidityProvider.lastAccruedBlockOrSecond(tokenB.address);

      await impersonateAccount(prime.address);
      const primeSigner = await ethers.provider.getSigner(prime.address);
      await wallet.sendTransaction({ to: prime.address, value: ethers.utils.parseEther("10") });

      const tx = await primeLiquidityProvider.connect(primeSigner).releaseFunds(tokenA.address);
      await tx.wait();

      const currentBlockOrTimestampTokenA = await primeLiquidityProvider.getBlockNumberOrTimestamp();
      const deltaBlocksOrSecondsTokenA = Number(currentBlockOrTimestampTokenA) - Number(lastAccruedBlockOrSecondTokenA);
      const accruedTokenA = deltaBlocksOrSecondsTokenA * Number(tokenASpeed);

      await expect(tx)
        .to.emit(primeLiquidityProvider, "TokenTransferredToPrime")
        .withArgs(tokenA.address, BigInt(accruedTokenA));

      expect(await primeLiquidityProvider.tokenAmountAccrued(tokenA.address)).to.equal(0);
    });
  });

  describe("Sweep token", () => {
    it("Revert on insufficient balance", async () => {
      const tx = primeLiquidityProvider.sweepToken(tokenA.address, signer.address, 1000);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "InsufficientBalance").withArgs(1000, 0);
    });

    it(" Sweep token success", async () => {
      const sweepAmount = 1000;
      await tokenA.transfer(primeLiquidityProvider.address, sweepAmount);

      const balanceBefore = await tokenA.balanceOf(signer.address);
      const tx = await primeLiquidityProvider.sweepToken(tokenA.address, signer.address, sweepAmount);
      await tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "SweepToken")
        .withArgs(tokenA.address, signer.address, sweepAmount);

      expect(await tokenA.balanceOf(signer.address)).to.be.equal(balanceBefore.add(sweepAmount));
    });
  });
});
