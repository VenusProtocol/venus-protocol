import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  EIP20InterfaceExtended,
  IAccessControlManager,
  IERC20MetadataUpgradeable,
  IPriceOracle,
  PegStability,
  PegStability__factory,
  ResilientOracleInterface,
  VTreasury,
} from "../../../typechain";
import { VAI } from "../../../typechain/contracts/Tokens/VAI";
import { convertToUnit } from "./../../../helpers/utils";

chai.use(smock.matchers);

const TEN_PERCENT = 1000; // in bps
const TWENTY_PERCENT = 2000;
const HUNDERD_PERCENT = 10000;
const VAI_MINT_CAP = convertToUnit(1000, 18);
const ZERO_ADDRESS = constants.AddressZero;
const MAX_UINT_8: BigNumber = BigNumber.from(255);

// TESTS WILL RUN SEPARATELY WITH STABLE TOKEN DECIMALS IN THIS ARRAY
const tokenDecimals: number[] = [18, 8, 6];

type ResetAllFakes = () => void;
type PegStabilityFixture = {
  pegStability: MockContract<PegStability>;
  stableToken: FakeContract<IERC20MetadataUpgradeable>;
  acm: FakeContract<IAccessControlManager>;
  vai: FakeContract<VAI>;
  venusTreasury: FakeContract<VTreasury>;
  priceOracle: FakeContract<IPriceOracle>;
};

async function pegStabilityFixture(tokenDecimals: number): Promise<PegStabilityFixture> {
  const acm = await smock.fake<IAccessControlManager>("IAccessControlManager");
  const venusTreasury = await smock.fake<VTreasury>("VTreasury");
  const stableToken = await smock.fake<IERC20MetadataUpgradeable>("IERC20MetadataUpgradeable");
  stableToken.decimals.returns(tokenDecimals);
  const priceOracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const vai = await smock.fake<VAI>("contracts/Tokens/VAI/VAI.sol:VAI");
  const PSMFactory = await smock.mock<PegStability__factory>("PegStability");
  const pegStability = await PSMFactory.deploy(stableToken.address, vai.address);
  await pegStability.setVariables({
    _accessControlManager: acm.address,
    venusTreasury: venusTreasury.address,
    oracle: priceOracle.address,
    feeIn: TEN_PERCENT,
    feeOut: TEN_PERCENT,
    vaiMintCap: VAI_MINT_CAP,
  });
  stableToken.transfer.returns(true);
  const priceOneUSD = parseUnits("1", 36 - tokenDecimals);
  priceOracle.getPrice.returns(priceOneUSD);
  return { pegStability, stableToken, acm, vai, venusTreasury, priceOracle };
}

async function swapStableForVAIAndVerify(
  stableToken: FakeContract<EIP20InterfaceExtended>,
  adminAddress: string,
  pegStability: MockContract<PegStability>,
  STABLE_TOKEN_AMOUNT: BigNumber,
  receiverAddress: string,
  vai: FakeContract<VAI>,
  VAI_TO_SEND: string,
  venusTreasury: FakeContract<VTreasury>,
  VAI_FEE: string,
) {
  stableToken.balanceOf.returnsAtCall(0, 0);
  stableToken.transferFrom.whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT).returns(true);
  stableToken.balanceOf.returnsAtCall(1, STABLE_TOKEN_AMOUNT);
  const tx = await pegStability.swapStableForVAI(receiverAddress, STABLE_TOKEN_AMOUNT);
  expect(vai.mint.atCall(0)).to.have.been.calledWith(receiverAddress, VAI_TO_SEND);
  if (VAI_FEE !== "0") {
    expect(vai.mint.atCall(1)).to.have.been.calledWith(venusTreasury.address, VAI_FEE);
  }
  await expect(tx).to.emit(pegStability, "StableForVAISwapped").withArgs(STABLE_TOKEN_AMOUNT, VAI_TO_SEND, VAI_FEE);
}

async function swapVAIForStableAndVerify(
  vai: FakeContract<VAI>,
  adminAddress: string,
  USER_VAI_BALANCE: string,
  venusTreasury: FakeContract<VTreasury>,
  VAI_FEE_TO_TREASURY: string,
  pegStability: MockContract<PegStability>,
  receiverAddress: string,
  STABLE_TOKEN_AMOUNT: BigNumber,
  stableToken: FakeContract<EIP20InterfaceExtended>,
  VAI_TO_BURN: string,
) {
  vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
  vai.transferFrom.whenCalledWith(adminAddress, venusTreasury.address, VAI_FEE_TO_TREASURY).returns(true);
  const tx = await pegStability.swapVAIForStable(receiverAddress, STABLE_TOKEN_AMOUNT);
  if (VAI_FEE_TO_TREASURY !== "0") {
    expect(vai.transferFrom).to.have.been.calledOnceWith(adminAddress, venusTreasury.address, VAI_FEE_TO_TREASURY);
  }
  expect(vai.burn).to.have.been.calledOnceWith(adminAddress, VAI_TO_BURN);
  expect(stableToken.transfer).to.have.been.calledOnceWith(receiverAddress, STABLE_TOKEN_AMOUNT);
  await expect(tx)
    .to.emit(pegStability, "VAIForStableSwapped")
    .withArgs(VAI_TO_BURN, STABLE_TOKEN_AMOUNT, VAI_FEE_TO_TREASURY);
}
describe("Peg Stability Module", () => {
  tokenDecimals.forEach(function (decimals) {
    describe(`PSM: ${decimals} decimals`, () => {
      let pegStability: MockContract<PegStability>;
      let stableToken: FakeContract<EIP20InterfaceExtended>;
      let acm: FakeContract<IAccessControlManager>;
      let vai: FakeContract<VAI>;
      let venusTreasury: FakeContract<VTreasury>;
      let priceOracle: FakeContract<IPriceOracle>;
      let admin: SignerWithAddress;
      let user: SignerWithAddress;
      let adminAddress: string;
      let receiverAddress: string;
      let STABLE_TOKEN_AMOUNT: BigNumber;
      let TOKEN_PRICE_ABOVE_ONE: BigNumber;
      let TOKEN_PRICE_BELOW_ONE: BigNumber;
      let resetAllFakes: ResetAllFakes;
      beforeEach(async () => {
        ({ pegStability, stableToken, acm, vai, venusTreasury, priceOracle } = await loadFixture(
          pegStabilityFixture.bind(null, decimals),
        ));
        const priceDecimals = 36 - decimals;
        STABLE_TOKEN_AMOUNT = parseUnits("100", decimals);
        TOKEN_PRICE_ABOVE_ONE = parseUnits("1.1", priceDecimals);
        TOKEN_PRICE_BELOW_ONE = parseUnits("0.9", priceDecimals);
        resetAllFakes = () => {
          vai.burn.reset();
          vai.mint.reset();
          vai.transferFrom.reset();
          vai.transferFrom.returns(true);
          stableToken.transfer.reset();
          stableToken.transfer.returns(true);
          stableToken.balanceOf.reset();
        };
        [admin, user] = await ethers.getSigners();
        adminAddress = await admin.getAddress();
        receiverAddress = await user.getAddress();
      });
      describe("initialization", () => {
        beforeEach(async () => {
          await pegStability.setVariables({
            _accessControlManager: ZERO_ADDRESS,
            venusTreasury: ZERO_ADDRESS,
            oracle: ZERO_ADDRESS,
            feeIn: 0,
            feeOut: 0,
            vaiMintCap: 0,
            _initialized: 0, // Initilising is locked after constructor execution of the implementation
          });
        });
        it("should revert if contract already deployed", async () => {
          await pegStability.setVariables({
            _initialized: MAX_UINT_8, // lock initialisation
          });
          await expect(
            pegStability.initialize(
              acm.address,
              venusTreasury.address,
              stableToken.address,
              TEN_PERCENT,
              TEN_PERCENT,
              VAI_MINT_CAP,
            ),
          ).to.be.rejectedWith("Initializable: contract is already initialized");
        });
        describe("reverts if init address = 0x0:", () => {
          it("acm", async () => {
            await expect(
              pegStability.initialize(
                ZERO_ADDRESS,
                venusTreasury.address,
                stableToken.address,
                TEN_PERCENT,
                TEN_PERCENT,
                VAI_MINT_CAP,
              ),
            ).to.be.revertedWithCustomError(pegStability, "ZeroAddress");
          });
          it("treasury", async () => {
            await expect(
              pegStability.initialize(
                acm.address,
                ZERO_ADDRESS,
                stableToken.address,
                TEN_PERCENT,
                TEN_PERCENT,
                VAI_MINT_CAP,
              ),
            ).to.be.revertedWithCustomError(pegStability, "ZeroAddress");
          });
          it("stableToken", async () => {
            await expect(
              pegStability.initialize(
                acm.address,
                venusTreasury.address,
                ZERO_ADDRESS,
                TEN_PERCENT,
                TEN_PERCENT,
                VAI_MINT_CAP,
              ),
            ).to.be.revertedWithCustomError(pegStability, "ZeroAddress");
          });
        });
        describe("reverts if fee init value is invalid", () => {
          it("feeIn", async () => {
            await expect(
              pegStability.initialize(
                acm.address,
                venusTreasury.address,
                stableToken.address,
                HUNDERD_PERCENT, //invalid
                TEN_PERCENT,
                VAI_MINT_CAP,
              ),
            ).to.be.revertedWithCustomError(pegStability, "InvalidFee");
          });
          it("feeOut", async () => {
            await expect(
              pegStability.initialize(
                acm.address,
                venusTreasury.address,
                stableToken.address,
                TEN_PERCENT,
                HUNDERD_PERCENT, //invalid
                VAI_MINT_CAP,
              ),
            ).to.be.revertedWithCustomError(pegStability, "InvalidFee");
          });
        });
        it("should initialize sucessfully", async () => {
          await expect(
            pegStability.initialize(
              acm.address,
              venusTreasury.address,
              stableToken.address,
              TEN_PERCENT,
              TEN_PERCENT,
              VAI_MINT_CAP,
            ),
          );
        });
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
            acm.isAllowedToCall.whenCalledWith(adminAddress, "pause()").returns(true);
            await pegStability.setVariable("isPaused", true);
            await expect(pegStability.pause()).to.be.revertedWithCustomError(pegStability, "AlreadyPaused");
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
            acm.isAllowedToCall.whenCalledWith(adminAddress, "resume()").returns(true);
            await pegStability.setVariable("isPaused", false);
            await expect(pegStability.resume()).to.be.revertedWithCustomError(pegStability, "NotPaused");
          });
        });
        describe("setFeeIn(uint256)", () => {
          it("should revert if not authorised", async () => {
            await expect(pegStability.setFeeIn(0)).to.be.revertedWithCustomError(pegStability, "Unauthorized");
          });
          it("should revert if fee is invalid", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setFeeIn(uint256)").returns(true);
            await expect(pegStability.setFeeIn(HUNDERD_PERCENT)).to.be.revertedWithCustomError(
              pegStability,
              "InvalidFee",
            );
          });
          it("set the correct fee", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setFeeIn(uint256)").returns(true);
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
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setFeeIn(uint256)").returns(true);
            await expect(pegStability.setFeeIn(HUNDERD_PERCENT)).to.be.revertedWithCustomError(
              pegStability,
              "InvalidFee",
            );
          });
          it("set the correct fee", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setFeeOut(uint256)").returns(true);
            await expect(pegStability.setFeeOut(TWENTY_PERCENT))
              .to.emit(pegStability, "FeeOutChanged")
              .withArgs(TEN_PERCENT, TWENTY_PERCENT);
            const feeOut = await pegStability.getVariable("feeOut");
            expect(feeOut).to.equal(TWENTY_PERCENT);
          });
        });
        describe("setVAIMintCap(uint256)", () => {
          it("should revert if not authorised", async () => {
            await expect(pegStability.setVAIMintCap(0)).to.be.revertedWithCustomError(pegStability, "Unauthorized");
          });
          it("should set the correct mint cap", async () => {
            const OLD_MINT_CAP = await pegStability.getVariable("vaiMintCap");
            const NEW_MINT_CAP = convertToUnit(10, 18);
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setVAIMintCap(uint256)").returns(true);
            await expect(pegStability.setVAIMintCap(NEW_MINT_CAP))
              .to.emit(pegStability, "VAIMintCapChanged")
              .withArgs(OLD_MINT_CAP, NEW_MINT_CAP);
            expect(await pegStability.getVariable("vaiMintCap")).to.equal(NEW_MINT_CAP);
          });
        });
        describe("setVenusTreasury(uint256)", () => {
          it("should revert if not authorised", async () => {
            await expect(pegStability.setVenusTreasury(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
              pegStability,
              "Unauthorized",
            );
          });
          it("should revert if zero address", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setVenusTreasury(address)").returns(true);
            await expect(pegStability.setVenusTreasury(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
              pegStability,
              "ZeroAddress",
            );
          });
          it("should set the treasury address", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setVenusTreasury(address)").returns(true);
            const randomAddress = await user.getAddress();
            await expect(pegStability.setVenusTreasury(randomAddress))
              .to.emit(pegStability, "VenusTreasuryChanged")
              .withArgs(venusTreasury.address, randomAddress);
            expect(await pegStability.getVariable("venusTreasury")).to.equal(randomAddress);
          });
        });
        describe("setOracle(address)", () => {
          it("should revert if not authorised", async () => {
            await expect(pegStability.setOracle(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
              pegStability,
              "Unauthorized",
            );
          });
          it("should revert if oracle address is zero", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setOracle(address)").returns(true);
            await expect(pegStability.setOracle(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
              pegStability,
              "ZeroAddress",
            );
          });
          it("should set the oracle", async () => {
            acm.isAllowedToCall.whenCalledWith(adminAddress, "setOracle(address)").returns(true);
            const newPriceOracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
            await expect(pegStability.setOracle(newPriceOracle.address))
              .to.emit(pegStability, "OracleChanged")
              .withArgs(priceOracle.address, newPriceOracle.address);
            expect(await pegStability.getVariable("oracle")).to.equal(newPriceOracle.address);
          });
        });
      });
      describe("Pause logic", () => {
        beforeEach(async () => {
          await pegStability.setVariable("isPaused", true);
        });
        it("should revert when paused and call swapVAIForStable(address,uint256)", async () => {
          await expect(pegStability.swapVAIForStable(adminAddress, 100)).to.be.revertedWithCustomError(
            pegStability,
            "Paused",
          );
        });
        it("should revert when paused and call swapStableForVAI(address,uint256)", async () => {
          await expect(pegStability.swapStableForVAI(adminAddress, 100)).to.be.revertedWithCustomError(
            pegStability,
            "Paused",
          );
        });
      });
      describe("Swap functions", () => {
        describe("swapVAIForStable(address,uint256)", () => {
          beforeEach(async () => {
            const VAI_MINTED = convertToUnit(110, 18);
            await pegStability.setVariable("vaiMinted", VAI_MINTED);
          });
          it("should revert if receiver is zero address ", async () => {
            await expect(
              pegStability.swapVAIForStable(ethers.constants.AddressZero, 100),
            ).to.be.revertedWithCustomError(pegStability, "ZeroAddress");
          });
          it("should revert if sender has insufficient VAI balance ", async () => {
            const USER_VAI_BALANCE = convertToUnit(109, 18); // USER NEEDS TO HAVE 110 VAI
            vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
            await expect(
              pegStability.swapVAIForStable(adminAddress, STABLE_TOKEN_AMOUNT),
            ).to.be.revertedWithCustomError(pegStability, "NotEnoughVAI");
          });
          it("should revert if VAI transfer fails ", async () => {
            const USER_VAI_BALANCE = convertToUnit(110, 18);
            vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
            await expect(
              pegStability.swapVAIForStable(adminAddress, STABLE_TOKEN_AMOUNT),
            ).to.be.revertedWithCustomError(pegStability, "VAITransferFail");
          });
          it("should revert if VAI to be burnt > vaiMinted ", async () => {
            const STABLE_TOKEN_AMOUNT_DOUBLE = STABLE_TOKEN_AMOUNT.mul(2);
            const USER_VAI_BALANCE = convertToUnit(300, 18);
            vai.balanceOf.whenCalledWith(adminAddress).returns(USER_VAI_BALANCE);
            vai.transferFrom.returns(true);
            await expect(
              pegStability.swapVAIForStable(adminAddress, STABLE_TOKEN_AMOUNT_DOUBLE),
            ).to.be.revertedWithCustomError(pegStability, "VAIMintedUnderflow");
          });
          describe("should sucessfully perform the swap", () => {
            beforeEach(async () => {
              resetAllFakes();
            });
            describe("Fees: 10%", () => {
              const USER_VAI_BALANCE = convertToUnit(110, 18);
              const VAI_FEE_TO_TREASURY = convertToUnit(10, 18);
              const VAI_TO_BURN = convertToUnit(100, 18);
              it("stable token = 1$ ", async () => {
                await swapVAIForStableAndVerify(
                  vai,
                  adminAddress,
                  USER_VAI_BALANCE,
                  venusTreasury,
                  VAI_FEE_TO_TREASURY,
                  pegStability,
                  receiverAddress,
                  STABLE_TOKEN_AMOUNT,
                  stableToken,
                  VAI_TO_BURN,
                );
              });
              it("stable token < 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_BELOW_ONE); // 0.9$
                await swapVAIForStableAndVerify(
                  vai,
                  adminAddress,
                  USER_VAI_BALANCE,
                  venusTreasury,
                  VAI_FEE_TO_TREASURY,
                  pegStability,
                  receiverAddress,
                  STABLE_TOKEN_AMOUNT,
                  stableToken,
                  VAI_TO_BURN,
                );
              });
              it("stable token > 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_ABOVE_ONE); // 1.1$
                const USER_VAI_BALANCE = convertToUnit(121, 18); // 121 (110 VAI + 11 VAI fee)
                const VAI_FEE_TO_TREASURY = convertToUnit(11, 18);
                const VAI_TO_BURN = convertToUnit(110, 18);
                await swapVAIForStableAndVerify(
                  vai,
                  adminAddress,
                  USER_VAI_BALANCE,
                  venusTreasury,
                  VAI_FEE_TO_TREASURY,
                  pegStability,
                  receiverAddress,
                  STABLE_TOKEN_AMOUNT,
                  stableToken,
                  VAI_TO_BURN,
                );
              });
            });
            describe("Fees: 0%", () => {
              const VAI_FEE_TO_TREASURY = "0";
              const USER_VAI_BALANCE = convertToUnit(100, 18);
              const VAI_TO_BURN = convertToUnit(100, 18);
              beforeEach(async () => {
                await pegStability.setVariables({
                  feeIn: 0,
                  feeOut: 0,
                });
              });
              it("stable token = 1$ ", async () => {
                await swapVAIForStableAndVerify(
                  vai,
                  adminAddress,
                  USER_VAI_BALANCE,
                  venusTreasury,
                  VAI_FEE_TO_TREASURY,
                  pegStability,
                  receiverAddress,
                  STABLE_TOKEN_AMOUNT,
                  stableToken,
                  VAI_TO_BURN,
                );
              });
              it("stable token < 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_BELOW_ONE); // 0.9$
                await swapVAIForStableAndVerify(
                  vai,
                  adminAddress,
                  USER_VAI_BALANCE,
                  venusTreasury,
                  VAI_FEE_TO_TREASURY,
                  pegStability,
                  receiverAddress,
                  STABLE_TOKEN_AMOUNT,
                  stableToken,
                  VAI_TO_BURN,
                );
              });
              it("stable token > 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_ABOVE_ONE); // 1.1$
                const USER_VAI_BALANCE = convertToUnit(121, 18); // 121 (110 VAI + 11 VAI fee)
                const VAI_FEE_TO_TREASURY = "0";
                const VAI_TO_BURN = convertToUnit(110, 18);
                await swapVAIForStableAndVerify(
                  vai,
                  adminAddress,
                  USER_VAI_BALANCE,
                  venusTreasury,
                  VAI_FEE_TO_TREASURY,
                  pegStability,
                  receiverAddress,
                  STABLE_TOKEN_AMOUNT,
                  stableToken,
                  VAI_TO_BURN,
                );
              });
            });
          });
        });
        describe("swapStableForVAI(address,uint256)", () => {
          beforeEach(async () => {
            resetAllFakes();
          });
          it("should revert if receiver is zero address ", async () => {
            await expect(
              pegStability.swapStableForVAI(ethers.constants.AddressZero, 100),
            ).to.be.revertedWithCustomError(pegStability, "ZeroAddress");
          });
          it("should revert if VAI mint cap will be reached ", async () => {
            const MINT_CAP = convertToUnit(99, 18);
            await pegStability.setVariable("vaiMintCap", MINT_CAP);
            stableToken.balanceOf.returnsAtCall(0, 0);
            stableToken.transferFrom
              .whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT)
              .returns(true);
            stableToken.balanceOf.returnsAtCall(1, STABLE_TOKEN_AMOUNT);
            await expect(
              pegStability.swapStableForVAI(adminAddress, STABLE_TOKEN_AMOUNT),
            ).to.be.revertedWithCustomError(pegStability, "VAIMintCapReached");
          });
          if (decimals == 18) {
            it("should revert if amount after transfer is too small  ", async function () {
              const TOO_SMALL_AMOUNT = 1;
              stableToken.balanceOf.returnsAtCall(0, 0);
              stableToken.transferFrom
                .whenCalledWith(adminAddress, pegStability.address, STABLE_TOKEN_AMOUNT)
                .returns(true);
              stableToken.balanceOf.returnsAtCall(1, TOO_SMALL_AMOUNT);
              await expect(
                pegStability.swapStableForVAI(adminAddress, STABLE_TOKEN_AMOUNT),
              ).to.be.revertedWithCustomError(pegStability, "AmountTooSmall");
            });
          }
          describe("should sucessfully perform the swap", () => {
            beforeEach(async () => {
              resetAllFakes();
            });
            describe("Fees: 10%", () => {
              const VAI_FEE = convertToUnit(10, 18);
              const VAI_TO_SEND = convertToUnit(90, 18);
              it("stable token = 1$ ", async () => {
                await swapStableForVAIAndVerify(
                  stableToken,
                  adminAddress,
                  pegStability,
                  STABLE_TOKEN_AMOUNT,
                  receiverAddress,
                  vai,
                  VAI_TO_SEND,
                  venusTreasury,
                  VAI_FEE,
                );
              });
              it("stable token > 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_ABOVE_ONE);
                await swapStableForVAIAndVerify(
                  stableToken,
                  adminAddress,
                  pegStability,
                  STABLE_TOKEN_AMOUNT,
                  receiverAddress,
                  vai,
                  VAI_TO_SEND,
                  venusTreasury,
                  VAI_FEE,
                );
              });
              it("stable token < 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_BELOW_ONE);
                const VAI_FEE = convertToUnit(9, 18);
                const VAI_TO_SEND = convertToUnit(81, 18);
                await swapStableForVAIAndVerify(
                  stableToken,
                  adminAddress,
                  pegStability,
                  STABLE_TOKEN_AMOUNT,
                  receiverAddress,
                  vai,
                  VAI_TO_SEND,
                  venusTreasury,
                  VAI_FEE,
                );
              });
            });
            describe("Fees: 0%", () => {
              const VAI_FEE = "0";
              const VAI_TO_SEND = convertToUnit(100, 18);
              beforeEach(async () => {
                await pegStability.setVariables({
                  feeIn: 0,
                  feeOut: 0,
                });
                stableToken.balanceOf.reset();
                vai.mint.reset();
              });
              it("stable token = 1$ ", async () => {
                await swapStableForVAIAndVerify(
                  stableToken,
                  adminAddress,
                  pegStability,
                  STABLE_TOKEN_AMOUNT,
                  receiverAddress,
                  vai,
                  VAI_TO_SEND,
                  venusTreasury,
                  VAI_FEE,
                );
              });
              it("stable token > 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_ABOVE_ONE);
                await swapStableForVAIAndVerify(
                  stableToken,
                  adminAddress,
                  pegStability,
                  STABLE_TOKEN_AMOUNT,
                  receiverAddress,
                  vai,
                  VAI_TO_SEND,
                  venusTreasury,
                  VAI_FEE,
                );
              });
              it("stable token < 1$ ", async () => {
                priceOracle.getPrice.returns(TOKEN_PRICE_BELOW_ONE);
                const VAI_TO_SEND = convertToUnit(90, 18);
                await swapStableForVAIAndVerify(
                  stableToken,
                  adminAddress,
                  pegStability,
                  STABLE_TOKEN_AMOUNT,
                  receiverAddress,
                  vai,
                  VAI_TO_SEND,
                  venusTreasury,
                  VAI_FEE,
                );
              });
            });
          });
        });
      });
    });
  });
});
