import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToBigInt } from "../../../helpers/utils";
import {
  ComptrollerMock,
  LiquidatorHarness,
  LiquidatorHarness__factory,
  MockVBNB,
  VBep20Immutable,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const seizeTokens = 1000n * 4n; // forced
const announcedIncentive = convertToBigInt("1.1", 18);
const treasuryPercent = convertToBigInt("0.05", 18);

type LiquidatorFixture = {
  comptroller: FakeContract<ComptrollerMock>;
  vTokenCollateral: FakeContract<VBep20Immutable>;
  liquidator: MockContract<LiquidatorHarness>;
  vBnb: FakeContract<MockVBNB>;
};

async function deployLiquidator(): Promise<LiquidatorFixture> {
  const [, treasury] = await ethers.getSigners();

  const comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
  comptroller.liquidationIncentiveMantissa.returns(announcedIncentive);
  const vBnb = await smock.fake<MockVBNB>("MockVBNB");
  const vTokenCollateral = await smock.fake<VBep20Immutable>("VBep20Immutable");

  const Liquidator = await smock.mock<LiquidatorHarness__factory>("LiquidatorHarness");
  const liquidator = await upgrades.deployProxy(Liquidator, [treasuryPercent], {
    constructorArgs: [comptroller.address, vBnb.address, treasury.address],
  });

  return { comptroller, vBnb, vTokenCollateral, liquidator };
}

function configure(fixture: LiquidatorFixture) {
  const { comptroller, vTokenCollateral } = fixture;
  comptroller.liquidationIncentiveMantissa.returns(announcedIncentive);
  vTokenCollateral.transfer.reset();
  vTokenCollateral.transfer.returns(true);
}

function calculateSplitSeizedTokens(amount: bigint) {
  const seizedForRepayment = (amount * convertToBigInt("1", 18)) / announcedIncentive;
  const treasuryDelta = (seizedForRepayment * treasuryPercent) / convertToBigInt("1", 18);
  const liquidatorDelta = amount - treasuryDelta;
  return { treasuryDelta, liquidatorDelta };
}

describe("Liquidator", () => {
  let liquidator: SignerWithAddress;
  let treasury: SignerWithAddress;
  let vTokenCollateral: FakeContract<VBep20Immutable>;
  let liquidatorContract: MockContract<LiquidatorHarness>;

  beforeEach(async () => {
    [liquidator, treasury] = await ethers.getSigners();
    const contracts = await loadFixture(deployLiquidator);
    configure(contracts);
    ({ vTokenCollateral, liquidator: liquidatorContract } = contracts);
  });

  describe("splitLiquidationIncentive", () => {
    it("splits liquidationIncentive between Treasury and Liquidator with correct amounts", async () => {
      const splitResponse = await liquidatorContract.splitLiquidationIncentive(seizeTokens);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(splitResponse["ours"]).to.equal(expectedData.treasuryDelta);
      expect(splitResponse["theirs"]).to.equal(expectedData.liquidatorDelta);
    });
  });

  describe("distributeLiquidationIncentive", () => {
    it("distributes the liquidationIncentive between Treasury and Liquidator with correct amounts", async () => {
      const tx = await liquidatorContract.distributeLiquidationIncentive(vTokenCollateral.address, seizeTokens);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(vTokenCollateral.transfer).to.have.been.calledWith(liquidator.address, expectedData.liquidatorDelta);
      expect(vTokenCollateral.transfer).to.have.been.calledWith(treasury.address, expectedData.treasuryDelta);
      await expect(tx)
        .to.emit(liquidatorContract, "DistributeLiquidationIncentive")
        .withArgs(expectedData.treasuryDelta, expectedData.liquidatorDelta);
    });

    it("reverts if transfer to liquidator fails", async () => {
      vTokenCollateral.transfer.returnsAtCall(0, false);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      await expect(liquidatorContract.distributeLiquidationIncentive(vTokenCollateral.address, seizeTokens))
        .to.be.revertedWithCustomError(liquidatorContract, "VTokenTransferFailed")
        .withArgs(liquidatorContract.address, liquidator.address, expectedData.liquidatorDelta);
    });

    it("reverts if transfer to treasury fails", async () => {
      vTokenCollateral.transfer.returnsAtCall(1, false);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      await expect(liquidatorContract.distributeLiquidationIncentive(vTokenCollateral.address, seizeTokens))
        .to.be.revertedWithCustomError(liquidatorContract, "VTokenTransferFailed")
        .withArgs(liquidatorContract.address, treasury.address, expectedData.treasuryDelta);
    });
  });
});
