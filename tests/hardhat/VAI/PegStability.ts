import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  IAccessControlManager,
  IERC20Upgradeable,
  PegStability,
  PegStability__factory,
  VBep20,
  VTreasury,
} from "../../../typechain";
import { PriceOracle } from "../../../typechain/contracts/PegStability/PegStability.sol";
import { VAI } from "../../../typechain/contracts/Tokens/VAI";
import { convertToUnit } from "./../../../helpers/utils";

const TEN_PERCENT = 1000; // in bps
const TWENTY_PERCENT = 2000;
const HUNDERD_PERCENT = 10000;
const VAI_MIN_CAP = convertToUnit(1000, 18);
const PRICE_ONE_USD = convertToUnit(1, 18);

type PegStaibilityFixture = {
  pegStability: MockContract<PegStability>;
  stableToken: FakeContract<IERC20Upgradeable>;
  acm: FakeContract<IAccessControlManager>;
  vai: FakeContract<VAI>;
  venusTreasury: FakeContract<VTreasury>;
  priceOracle: FakeContract<PriceOracle>;
};

async function pegStaibilityFixture(): Promise<PegStaibilityFixture> {
  const acm = await smock.fake<IAccessControlManager>("IAccessControlManager");
  const venusTreasury = await smock.fake<VTreasury>("VTreasury");
  const stableToken = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
  const vToken = await smock.fake<VBep20>("VBep20");
  vToken.underlying.returns(stableToken.address);
  const vai = await smock.fake<VAI>("contracts/Tokens/VAI/VAI.sol:VAI");
  const PSMFactory = await smock.mock<PegStability__factory>("PegStability");
  const pegStability = await PSMFactory.deploy(vToken.address, vai.address);
  const priceOracle = await smock.fake<PriceOracle>("contracts/PegStability/PegStability.sol:PriceOracle");
  await pegStability.setVariables({
    _accessControlManager: acm.address,
    venusTreasury: venusTreasury.address,
    priceOracle: priceOracle.address,
    feeIn: TEN_PERCENT,
    feeOut: TEN_PERCENT,
    vaiMintCap: VAI_MIN_CAP,
  });
  stableToken.transferFrom.returns(true);
  return { pegStability, stableToken, acm, vai, venusTreasury, priceOracle };
}

describe("Peg Stability Module", () => {
  let pegStability: MockContract<PegStability>;
  let stableToken: FakeContract<IERC20Upgradeable>;
  let acm: FakeContract<IAccessControlManager>;
  let vai: FakeContract<VAI>;
  let venusTreasury: FakeContract<VTreasury>;
  let priceOracle: FakeContract<PriceOracle>;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let adminAddress: string;
  beforeEach(async () => {
    ({ pegStability, stableToken, acm, vai, venusTreasury, priceOracle } = await loadFixture(pegStaibilityFixture));
    [admin, user] = await ethers.getSigners();
    adminAddress = await admin.getAddress();
    priceOracle.getUnderlyingPrice.returns(PRICE_ONE_USD);
  });
  describe("Admin functions", () => {
    describe("pause()", () => {
      it("should revert if not authorised", async () => {
        await expect(pegStability.pause()).to.be.revertedWithCustomError(pegStability, "Unauthorized");
      });
      it("should pause if authorised", async () => {
        acm.isAllowedToCall.whenCalledWith(adminAddress, "pause()").returns(true);
        await expect(pegStability.pause()).to.emit(pegStability, "PSMPaused").withArgs(adminAddress);
        const paused = await pegStability.getVariable("isPaused");
        expect(paused).to.be.true;
      });
      it("should revert if already paused", async () => {
        await pegStability.setVariable("isPaused", true);
        await expect(pegStability.pause()).to.be.revertedWith("PSM is already paused.");
      });
    });
    describe("resume()", () => {
      it("should revert if not authorised", async () => {
        await expect(pegStability.resume()).to.be.revertedWithCustomError(pegStability, "Unauthorized");
      });
      it("should resume if authorised", async () => {
        acm.isAllowedToCall.whenCalledWith(adminAddress, "resume()").returns(true);
        await pegStability.setVariable("isPaused", true);
        await expect(pegStability.resume()).to.emit(pegStability, "PSMResumed").withArgs(adminAddress);
        const paused = await pegStability.getVariable("isPaused");
        expect(paused).to.be.false;
      });
      it("should revert if already resumed", async () => {
        await pegStability.setVariable("isPaused", false);
        await expect(pegStability.resume()).to.be.revertedWith("PSM is not paused.");
      });
    });
    describe("setFeeIn(uint256)", () => {
      it("should revert if not authorised", async () => {
        await expect(pegStability.setFeeIn(0)).to.be.revertedWithCustomError(pegStability, "Unauthorized");
      });
      it("should revert if fee is invalid", async () => {
        acm.isAllowedToCall.whenCalledWith(adminAddress, "setFeeIn(uint256)").returns(true);
        await expect(pegStability.setFeeIn(HUNDERD_PERCENT)).to.be.revertedWith("Invalid fee.");
      });
      it("set the correct fee", async () => {
        await expect(pegStability.setFeeIn(TWENTY_PERCENT))
          .to.emit(pegStability, "FeeInChanged")
          .withArgs(TEN_PERCENT, TWENTY_PERCENT);
        const feeIn = await pegStability.getVariable("feeIn");
        expect(feeIn).to.equal(TWENTY_PERCENT);
      });
    });
    describe("setFeeOut(uint256)", () => {
      it("should revert if not authorised", async () => {
        await expect(pegStability.setFeeOut(0)).to.be.revertedWithCustomError(pegStability, "Unauthorized");
      });
      it("should revert if fee is invalid", async () => {
        acm.isAllowedToCall.whenCalledWith(adminAddress, "setFeeOut(uint256)").returns(true);
        await expect(pegStability.setFeeIn(HUNDERD_PERCENT)).to.be.revertedWith("Invalid fee.");
      });
      it("set the correct fee", async () => {
        await expect(pegStability.setFeeOut(TWENTY_PERCENT))
          .to.emit(pegStability, "FeeOutChanged")
          .withArgs(TEN_PERCENT, TWENTY_PERCENT);
        const feeOut = await pegStability.getVariable("feeOut");
        expect(feeOut).to.equal(TWENTY_PERCENT);
      });
    });
    describe("setVaiMintCap(uint256)", () => {
      it("should revert if not authorised", async () => {
        await expect(pegStability.setVaiMintCap(0)).to.be.revertedWithCustomError(pegStability, "Unauthorized");
      });
      it("should set the correct mint cap", async () => {
        const OLD_MINT_CAP = await pegStability.getVariable("vaiMintCap");
        const NEW_MINT_CAP = convertToUnit(10, 18);
        acm.isAllowedToCall.whenCalledWith(adminAddress, "setVaiMintCap(uint256)").returns(true);
        await expect(pegStability.setVaiMintCap(NEW_MINT_CAP))
          .to.emit(pegStability, "VaiMintCapChanged")
          .withArgs(OLD_MINT_CAP, NEW_MINT_CAP);
        expect(await pegStability.getVariable("vaiMintCap")).to.equal(NEW_MINT_CAP);
      });
    });
    describe("setVaiMintCap(uint256)", () => {
      it("should revert if not authorised", async () => {
        await expect(pegStability.setVenusTreasury(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
          pegStability,
          "Unauthorized",
        );
      });
      it("should revert if zero address", async () => {
        acm.isAllowedToCall.whenCalledWith(adminAddress, "setVenusTreasury(address)").returns(true);
        await expect(pegStability.setVenusTreasury(ethers.constants.AddressZero)).to.be.revertedWith(
          "Can't be zero address.",
        );
      });
      it("should set the correct mint cap", async () => {
        const randomAddress = await user.getAddress();
        await expect(pegStability.setVenusTreasury(randomAddress))
          .to.emit(pegStability, "VenusTreasuryChanged")
          .withArgs(venusTreasury.address, randomAddress);
        expect(await pegStability.getVariable("venusTreasury")).to.equal(randomAddress);
      });
    });
  });
  describe("Pause logic", () => {
    beforeEach(async () => {
      await pegStability.setVariable("isPaused", true);
    });
    it("should revert when paused and call swapVAIForStable(address,uint256)", async () => {
      await expect(pegStability.swapVAIForStable(adminAddress, 100)).to.be.revertedWith("Contract is paused.");
    });
    it("should revert when paused and call swapStableForVAI(address,uint256)", async () => {
      await expect(pegStability.swapStableForVAI(adminAddress, 100)).to.be.revertedWith("Contract is paused.");
    });
  });
  describe("Swap functions", () => {
    describe("swapVAIForStable(address,uint256)", () => {
      it("should revert if receiver is zero address ", async () => {
        await expect(pegStability.swapVAIForStable(ethers.constants.AddressZero, 100)).to.be.revertedWith(
          "Can't be zero address.",
        );
      });
      it("should revert if sender has insufficient VAI balance ", async () => {
        const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
        const USER_VAI_BALANCE = convertToUnit(109, 18); // USER NEEDS TO HAVE 110 VAI
        vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
        await expect(pegStability.swapVAIForStable(adminAddress, STABLE_TOKEN_AMOUNT)).to.be.revertedWith(
          "Not enought VAI.",
        );
      });
      it("should revert if VAI transfer fails ", async () => {
        const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
        const USER_VAI_BALANCE = convertToUnit(110, 18);
        vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
        await expect(pegStability.swapVAIForStable(adminAddress, STABLE_TOKEN_AMOUNT)).to.be.revertedWith(
          "VAI fee transfer failed.",
        );
      });
      describe("should sucessfully perform the swap", () => {
        it("stable token = 1$ ", async () => {
          const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
          const USER_VAI_BALANCE = convertToUnit(110, 18);
          const VAI_FEE_TO_TREASURY = convertToUnit(10, 18);
          const VAI_TO_BURN = convertToUnit(100, 18);
          const receiverAddress = await user.getAddress();
          vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
          vai.transferFrom.whenCalledWith(adminAddress, venusTreasury.address, VAI_FEE_TO_TREASURY).returns(true);
          const tx = await pegStability.swapVAIForStable(receiverAddress, STABLE_TOKEN_AMOUNT);
          expect(vai.transferFrom.atCall(1)).to.have.been.calledWith(
            adminAddress,
            venusTreasury.address,
            VAI_FEE_TO_TREASURY,
          );
          expect(vai.burn).to.have.been.calledOnceWith(adminAddress, STABLE_TOKEN_AMOUNT);
          expect(stableToken.transferFrom).to.have.been.calledOnceWith(
            pegStability.address,
            receiverAddress,
            STABLE_TOKEN_AMOUNT,
          );
          await expect(tx)
            .to.emit(pegStability, "VaiForStableSwapped")
            .withArgs(VAI_TO_BURN, VAI_FEE_TO_TREASURY, STABLE_TOKEN_AMOUNT);
        });
        it("stable token < 1$ ", async () => {
          const STABLE_TOKEN_PRICE = convertToUnit(9, 17); // 0.9$
          priceOracle.getUnderlyingPrice.returns(STABLE_TOKEN_PRICE);
          const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
          const USER_VAI_BALANCE = convertToUnit(110, 18);
          const VAI_FEE_TO_TREASURY = convertToUnit(10, 18);
          const VAI_TO_BURN = convertToUnit(100, 18);
          const receiverAddress = await user.getAddress();
          vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
          vai.transferFrom.whenCalledWith(adminAddress, venusTreasury.address, VAI_FEE_TO_TREASURY).returns(true);
          const tx = await pegStability.swapVAIForStable(receiverAddress, STABLE_TOKEN_AMOUNT);
          expect(vai.transferFrom.atCall(2)).to.have.been.calledWith(
            adminAddress,
            venusTreasury.address,
            VAI_FEE_TO_TREASURY,
          );
          expect(vai.burn.atCall(1)).to.have.been.calledWith(adminAddress, STABLE_TOKEN_AMOUNT);
          expect(stableToken.transferFrom.atCall(1)).to.have.been.calledWith(
            pegStability.address,
            receiverAddress,
            STABLE_TOKEN_AMOUNT,
          );
          await expect(tx)
            .to.emit(pegStability, "VaiForStableSwapped")
            .withArgs(VAI_TO_BURN, VAI_FEE_TO_TREASURY, STABLE_TOKEN_AMOUNT);
        });
      });
    });
    describe("swapStableForVAI(address,uint256)", () => {
      it("should revert if receiver is zero address ", async () => {
        await expect(pegStability.swapStableForVAI(ethers.constants.AddressZero, 100)).to.be.revertedWith(
          "Can't be zero address.",
        );
      });
      it("should revert if VAI mint cap will be reached ", async () => {
        const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
        const MINT_CAP = convertToUnit(99, 18);

        await pegStability.setVariable("vaiMintCap", MINT_CAP);
        stableToken.balanceOf.returnsAtCall(0, 0);
        stableToken.transferFrom.whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT).returns(true);
        stableToken.balanceOf.returnsAtCall(1, STABLE_TOKEN_AMOUNT);
        await expect(pegStability.swapStableForVAI(adminAddress, STABLE_TOKEN_AMOUNT)).to.be.revertedWith(
          "VAI mint cap reached.",
        );
      });
      it("should revert if amount after transfer is too small  ", async () => {
        const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
        const TOO_SMALL_AMOUNT = 9;

        stableToken.balanceOf.returnsAtCall(2, 0);
        stableToken.transferFrom.whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT).returns(true);
        stableToken.balanceOf.returnsAtCall(3, TOO_SMALL_AMOUNT);
        await expect(pegStability.swapStableForVAI(adminAddress, STABLE_TOKEN_AMOUNT)).to.be.revertedWith(
          "Amount too small.",
        );
      });
      describe("should sucessfully perform the swap", () => {
        it("stable token = 1$ ", async () => {
          const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
          const VAI_FEE = convertToUnit(10, 18);
          const VAI_TO_SEND = convertToUnit(90, 18);
          const receiverAddress = await user.getAddress();
          stableToken.balanceOf.returnsAtCall(4, 0);
          stableToken.transferFrom
            .whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT)
            .returns(true);
          stableToken.balanceOf.returnsAtCall(5, STABLE_TOKEN_AMOUNT);
          const tx = await pegStability.swapStableForVAI(receiverAddress, STABLE_TOKEN_AMOUNT);
          expect(vai.mint.atCall(0)).to.have.been.calledWith(receiverAddress, VAI_TO_SEND);
          expect(vai.mint.atCall(1)).to.have.been.calledWith(venusTreasury.address, VAI_FEE);
          await expect(tx)
            .to.emit(pegStability, "StableForVAISwapped")
            .withArgs(STABLE_TOKEN_AMOUNT, VAI_TO_SEND, VAI_FEE);
        });
        it("stable token > 1$ ", async () => {
          const STABLE_TOKEN_PRICE = convertToUnit(1.5, 18);
          priceOracle.getUnderlyingPrice.returns(STABLE_TOKEN_PRICE);
          const STABLE_TOKEN_AMOUNT = convertToUnit(100, 18);
          const VAI_FEE = convertToUnit(10, 18);
          const VAI_TO_SEND = convertToUnit(90, 18);
          const receiverAddress = await user.getAddress();
          stableToken.balanceOf.returnsAtCall(6, 0);
          stableToken.transferFrom
            .whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT)
            .returns(true);
          stableToken.balanceOf.returnsAtCall(7, STABLE_TOKEN_AMOUNT);
          const tx = await pegStability.swapStableForVAI(receiverAddress, STABLE_TOKEN_AMOUNT);
          expect(vai.mint.atCall(2)).to.have.been.calledWith(receiverAddress, VAI_TO_SEND);
          expect(vai.mint.atCall(3)).to.have.been.calledWith(venusTreasury.address, VAI_FEE);
          await expect(tx)
            .to.emit(pegStability, "StableForVAISwapped")
            .withArgs(STABLE_TOKEN_AMOUNT, VAI_TO_SEND, VAI_FEE);
        });
      });
    });
  });
});
