import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
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

const tokenASpeed = parseUnits("1", 16);
const tokenBSpeed = parseUnits("2", 16);
const tokenCSpeed = parseUnits("3", 16);
export const bigNumber1 = BigNumber.from("1");

const fixture = async () => {
  const signers = await ethers.getSigners();
  signer = signers[0];

  const FaucetToken = await smock.mock<FaucetToken__factory>("FaucetToken");

  prime = await smock.fake<Prime>("Prime");
  accessControl = await smock.fake<IAccessControlManager>("IAccessControlManager");
  tokenA = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENA", 18, "A");
  tokenB = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENB", 18, "B");
  tokenC = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENC", 18, "C");

  const PrimeLiquidityProvider = await ethers.getContractFactory("PrimeLiquidityProvider");
  primeLiquidityProvider = await upgrades.deployProxy(
    PrimeLiquidityProvider,
    [accessControl.address, [tokenA.address, tokenB.address], [tokenASpeed, tokenBSpeed]],
    {
      constructorArgs: [prime.address],
      unsafeAllow: ["state-variable-immutable"],
    },
  );
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

    it("Initial Balance", async () => {
      const tokenAInitialBalance = await primeLiquidityProvider.initialBalances(tokenA.address);
      const balanceA = await tokenA.balanceOf(primeLiquidityProvider.address);
      expect(tokenAInitialBalance).to.equal(balanceA);

      const tokenBInitialBalance = await primeLiquidityProvider.initialBalances(tokenB.address);
      const balanceB = await tokenB.balanceOf(primeLiquidityProvider.address);
      expect(tokenBInitialBalance).to.equal(balanceB);
    });
  });

  describe("Testing all setters", () => {
    beforeEach(async () => {
      await accessControl.isAllowedToCall.returns(true);
    });

    it("Revert on invalid args for initializeTokens", async () => {
      const tx = primeLiquidityProvider.initializeTokens([ethers.constants.AddressZero]);

      await expect(tx).to.be.to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidArguments");
    });

    it("Revert on re-intializing token", async () => {
      const tx = primeLiquidityProvider.initializeTokens([tokenA.address]);

      await expect(tx)
        .to.be.to.be.revertedWithCustomError(primeLiquidityProvider, "TokenAlreadyInitialized")
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

      await expect(tx).to.emit(primeLiquidityProvider, "FundsTransferpaused").withArgs(signer.address);

      expect(await primeLiquidityProvider.fundsTransferpaused()).to.equal(true);
    });

    it("resumeFundsTransfer", async () => {
      const tx = await primeLiquidityProvider.resumeFundsTransfer();
      tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "FundsTransferResumed").withArgs(signer.address);

      expect(await primeLiquidityProvider.fundsTransferpaused()).to.equal(false);
    });

    it("Revert on invalid args for setTokensDistributionSpeed", async () => {
      const tx = primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], []);

      await expect(tx).to.be.to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidArguments");
    });

    it("Revert on invalid distribution speed for setTokensDistributionSpeed", async () => {
      const tx = primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [convertToUnit(1, 19)]);

      await expect(tx)
        .to.be.to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidDistributionSpeed")
        .withArgs(convertToUnit(1, 19), convertToUnit(1, 18));
    });

    it("setTokensDistributionSpeed success", async () => {
      const tx = await primeLiquidityProvider.setTokensDistributionSpeed([tokenC.address], [tokenCSpeed]);
      tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "TokenDistributionSpeedUpdated")
        .withArgs(tokenC.address, tokenCSpeed);
    });

    it("Revert on invalid args for setInitialBalance", async () => {
      const tx = primeLiquidityProvider.setInitialBalance(ethers.constants.AddressZero);

      await expect(tx).to.be.to.be.revertedWithCustomError(primeLiquidityProvider, "InvalidArguments");
    });

    it("setInitialBalance success", async () => {
      await tokenC.transfer(primeLiquidityProvider.address, convertToUnit(300, 18));
      const balance = await tokenC.balanceOf(primeLiquidityProvider.address);
      const tx = await primeLiquidityProvider.setInitialBalance(tokenC.address);
      tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "TokenInitialBalanceUpdated").withArgs(tokenC.address, balance);
    });
  });

  describe("Accrue tokens", () => {
    beforeEach(async () => {
      await accessControl.isAllowedToCall.returns(true);

      await tokenA.transfer(primeLiquidityProvider.address, parseUnits("100", 18));
      await tokenB.transfer(primeLiquidityProvider.address, parseUnits("200", 18));

      // setting initial balance as while deploying the contract there was no funds allocated to primeLiquidityProvider
      await primeLiquidityProvider.setInitialBalance(tokenA.address);
    });

    it("Accrue amount for tokenA", async () => {
      await mine(10);

      await primeLiquidityProvider.accrueTokens(tokenA.address);
      const balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);

      expect(balanceA).to.equal("11000000000000000000");
    });

    it("Accrue amount for multiple tokens", async () => {
      await mine(10);
      await primeLiquidityProvider.accrueTokens(tokenA.address);
      await primeLiquidityProvider.setInitialBalance(tokenB.address);

      await mine(10);
      let balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      let balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(balanceA).to.equal("11000000000000000000");
      expect(balanceB).to.equal(0);

      await primeLiquidityProvider.accrueTokens(tokenA.address);
      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(balanceA).to.equal("23000000000000000000");
      expect(balanceB).to.equal(0);

      await mine(10);
      await primeLiquidityProvider.accrueTokens(tokenB.address);
      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(balanceA).to.equal("23000000000000000000");
      expect(balanceB).to.equal("88000000000000000000");

      await primeLiquidityProvider.accrueTokens(tokenA.address);
      await primeLiquidityProvider.accrueTokens(tokenB.address);
      balanceA = await primeLiquidityProvider.tokenAmountAccrued(tokenA.address);
      balanceB = await primeLiquidityProvider.tokenAmountAccrued(tokenB.address);

      expect(balanceA).to.equal("35000000000000000000");
      expect(balanceB).to.equal("96000000000000000000");

      await primeLiquidityProvider.setInitialBalance(tokenC.address);
      await mine(10);

      await primeLiquidityProvider.accrueTokens(tokenC.address);
      const balanceC = await primeLiquidityProvider.tokenAmountAccrued(tokenC.address);
      expect(balanceC).to.equal(0);
    });
  });

  describe("Release funds to prime contract", () => {
    beforeEach(async () => {
      await accessControl.isAllowedToCall.returns(true);

      await tokenA.transfer(primeLiquidityProvider.address, parseUnits("100", 18));
      await tokenB.transfer(primeLiquidityProvider.address, parseUnits("200", 18));

      // setting initial balance as while deploying the contract there was no funds allocated to primeLiquidityProvider
      await primeLiquidityProvider.setInitialBalance(tokenA.address);

      await mine(10);
    });

    it("Revert on funds ransfer paused", async () => {
      await primeLiquidityProvider.pauseFundsTransfer();

      const tx = primeLiquidityProvider.releaseFunds(tokenA.address);

      await expect(tx).to.be.to.be.revertedWithCustomError(primeLiquidityProvider, "FundsTransferIspaused");
    });

    it("Release funds success", async () => {
      const tx = await primeLiquidityProvider.releaseFunds(tokenA.address);
      tx.wait();

      await expect(tx)
        .to.emit(primeLiquidityProvider, "TokenTransferredToPrime")
        .withArgs(tokenA.address, "11000000000000000000");

      expect(await primeLiquidityProvider.tokenAmountAccrued(tokenA.address)).to.equal(0);
    });
  });

  describe("Sweep token", () => {
    it("Revert on insufficient balance", async () => {
      const tx = primeLiquidityProvider.sweepToken(tokenA.address, signer.address, 1000);

      await expect(tx).to.be.revertedWithCustomError(primeLiquidityProvider, "InsufficientBalance").withArgs(1000, 0);
    });

    it(" Sweep token success", async () => {
      await tokenA.transfer(primeLiquidityProvider.address, 1000);

      const tx = await primeLiquidityProvider.sweepToken(tokenA.address, signer.address, 1000);
      tx.wait();

      await expect(tx).to.emit(primeLiquidityProvider, "SweepToken").withArgs(tokenA.address, signer.address, 1000);
    });
  });
});
