import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  FaucetToken,
  FaucetToken__factory,
  IAccessControlManager,
  Prime,
  PrimeLiquidityProvider,
} from "../../../typechain";

let primeLiquidityProvider: MockContract<PrimeLiquidityProvider>;
let tokenA: MockContract<FaucetToken>;
let tokenB: MockContract<FaucetToken>;
let tokenC: MockContract<FaucetToken>;
let prime: FakeContract<Prime>;
let accessControl: FakeContract<IAccessControlManager>;
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
  accessControl = await smock.fake<IAccessControlManager>("IAccessControlManager");
  tokenA = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENA", 18, "A");
  tokenB = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENB", 18, "B");
  tokenC = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENC", 18, "C");

  const PrimeLiquidityProvider = await ethers.getContractFactory("PrimeLiquidityProvider");
  primeLiquidityProvider = await upgrades.deployProxy(PrimeLiquidityProvider, [
    accessControl.address,
    [tokenA.address, tokenB.address],
    [tokenASpeed, tokenBSpeed],
  ]);

  await primeLiquidityProvider.setPrimeToken(prime.address);
};

describe("PrimeLiquidityProvider: tests", () => {
  beforeEach(async () => {
    await loadFixture(fixture);
  });

  describe("Testing all initalized values", () => {
    it("Tokens intialized", async () => {
      const tokenABlock = await primeLiquidityProvider.lastAccruedBlock(tokenA.address);
      expect(tokenABlock).to.greaterThan(0);

      const tokenBBlock = await primeLiquidityProvider.lastAccruedBlock(tokenB.address);
      expect(tokenBBlock).to.greaterThan(0);
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
      tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "TokenDistributionInitialized").withArgs(tokenC.address);
    });

    it("pauseFundsTransfer", async () => {
      const tx = await primeLiquidityProvider.pauseFundsTransfer();
      tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "Paused").withArgs(signer.address);

      expect(await primeLiquidityProvider.paused()).to.equal(true);
    });

    it("resumeFundsTransfer", async () => {
      await primeLiquidityProvider.pauseFundsTransfer();
      const tx = await primeLiquidityProvider.resumeFundsTransfer();
      tx.wait();

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

      await primeLiquidityProvider.initializeTokens([tokenC.address]);
      const tx = primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [convertToUnit(1, 19)]);

      await expect(tx)
        .to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidDistributionSpeed")
        .withArgs(speedMoreThanMaxSpeed, maxDistributionSpeed);
    });

    it("setTokensDistributionSpeed success", async () => {
      await primeLiquidityProvider.initializeTokens([tokenC.address]);
      const tx = await primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [tokenCSpeed]);
      tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "TokenDistributionSpeedUpdated")
        .withArgs(tokenC.address, tokenCSpeed);
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
      tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "PrimeTokenUpdated").withArgs(prime.address, signers[2].address);
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

      const lastAccruedBlock = await primeLiquidityProvider.lastAccruedBlock(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      const currentBlock = await primeLiquidityProvider.getBlockNumber();

      const balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      const deltaBlocks = Number(currentBlock) - Number(lastAccruedBlock);
      const accrued = deltaBlocks * Number(tokenASpeed);

      expect(Number(balanceA)).to.equal(accrued);
    });

    it("Accrue amount for multiple tokens", async () => {
      await mine(10);

      let lastAccruedBlockTokenA = await primeLiquidityProvider.lastAccruedBlock(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      let currentBlockTokenA = await primeLiquidityProvider.getBlockNumber();

      await mine(10);

      let balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      let deltaBlocksTokenA = Number(currentBlockTokenA) - Number(lastAccruedBlockTokenA);
      let accruedTokenA = deltaBlocksTokenA * Number(tokenASpeed);

      let balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(Number(balanceA)).to.equal(accruedTokenA);
      // accrueTokens is not called for tokenB yet i.e. no amount is accrued
      expect(Number(balanceB)).to.equal(0);

      let previousAccruedTokenA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      lastAccruedBlockTokenA = await primeLiquidityProvider.lastAccruedBlock(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      currentBlockTokenA = await primeLiquidityProvider.getBlockNumber();

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      deltaBlocksTokenA = Number(currentBlockTokenA) - Number(lastAccruedBlockTokenA);
      accruedTokenA = deltaBlocksTokenA * Number(tokenASpeed);
      let totalAccruedTokenA = Number(previousAccruedTokenA) + accruedTokenA;

      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(Number(balanceA)).to.equal(totalAccruedTokenA);
      // accrueTokens is not called for tokenB yet i.e. no amount is accrued
      expect(balanceB).to.equal(0);

      await mine(10);
      let lastAccruedBlockTokenB = await primeLiquidityProvider.lastAccruedBlock(tokenB.address);
      await primeLiquidityProvider.accrueTokens(tokenB.address);
      let currentBlockTokenB = await primeLiquidityProvider.getBlockNumber();
      let deltaBlocksTokenB = Number(currentBlockTokenB) - Number(lastAccruedBlockTokenB);
      let accruedTokenB = deltaBlocksTokenB * Number(tokenBSpeed);

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      // accrueTokens is not called again for token B
      expect(Number(balanceA)).to.equal(totalAccruedTokenA);
      expect(Number(balanceB)).to.equal(accruedTokenB);

      previousAccruedTokenA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      lastAccruedBlockTokenA = await primeLiquidityProvider.lastAccruedBlock(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      currentBlockTokenA = await primeLiquidityProvider.getBlockNumber();

      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      deltaBlocksTokenA = Number(currentBlockTokenA) - Number(lastAccruedBlockTokenA);
      accruedTokenA = deltaBlocksTokenA * Number(tokenASpeed);
      totalAccruedTokenA = Number(previousAccruedTokenA) + accruedTokenA;

      const previousAccruedTokenB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);
      lastAccruedBlockTokenB = await primeLiquidityProvider.lastAccruedBlock(tokenB.address);
      await primeLiquidityProvider.accrueTokens(tokenB.address);
      currentBlockTokenB = await primeLiquidityProvider.getBlockNumber();
      deltaBlocksTokenB = Number(currentBlockTokenB) - Number(lastAccruedBlockTokenB);
      accruedTokenB = deltaBlocksTokenB * Number(tokenBSpeed);
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

      const lastAccruedBlockTokenA = await primeLiquidityProvider.lastAccruedBlock(tokenB.address);

      await impersonateAccount(prime.address);
      const primeSigner = await ethers.provider.getSigner(prime.address);
      await wallet.sendTransaction({ to: prime.address, value: ethers.utils.parseEther("10") });

      const tx = await primeLiquidityProvider.connect(primeSigner).releaseFunds(tokenA.address);
      tx.wait();

      const currentBlockTokenA = await primeLiquidityProvider.getBlockNumber();
      const deltaBlocksTokenA = Number(currentBlockTokenA) - Number(lastAccruedBlockTokenA);
      const accruedTokenA = deltaBlocksTokenA * Number(tokenASpeed);

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
      tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "SweepToken")
        .withArgs(tokenA.address, signer.address, sweepAmount);

      expect(await tokenA.balanceOf(signer.address)).to.be.equal(balanceBefore.add(sweepAmount));
    });
  });
});
