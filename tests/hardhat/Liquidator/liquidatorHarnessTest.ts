import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import { convertToBigInt, convertToUnit } from "../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerMock,
  FaucetToken,
  IAccessControlManagerV5,
  IProtocolShareReserve,
  LiquidatorHarness,
  LiquidatorHarness__factory,
  MockVBNB,
  VBep20Immutable,
  WBNB,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const seizeTokens = 1000n * 4n; // forced
const announcedIncentive = convertToBigInt("1.1", 18);
const treasuryPercent = convertToBigInt("0.05", 18);
const MANTISSA_ONE = convertToBigInt("1", 18);

type LiquidatorFixture = {
  comptroller: FakeContract<ComptrollerMock>;
  vTokenCollateral: FakeContract<VBep20Immutable>;
  liquidator: MockContract<LiquidatorHarness>;
  vBnb: FakeContract<MockVBNB>;
  wBnb: FakeContract<WBNB>;
  underlying: FakeContract<FaucetToken>;
};

async function deployLiquidator(): Promise<LiquidatorFixture> {
  const accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControlManager.isAllowedToCall.returns(true);
  const comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
  comptroller.getEffectiveLiquidationIncentive.returns(announcedIncentive);
  const vBnb = await smock.fake<MockVBNB>("MockVBNB");
  const wBnb = await smock.fake<WBNB>("WBNB");
  const underlying = await smock.fake<FaucetToken>("FaucetToken");
  underlying.balanceOf.returns(convertToUnit(1, 10));
  underlying.transfer.returns(true);
  const vTokenCollateral = await smock.fake<VBep20Immutable>("VBep20Immutable");
  vTokenCollateral.underlying.returns(underlying.address);
  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  const comptrollerLens = await smock.fake<ComptrollerLens>("ComptrollerLens");

  const Liquidator = await smock.mock<LiquidatorHarness__factory>("LiquidatorHarness");
  const liquidator = await upgrades.deployProxy(
    Liquidator,
    [treasuryPercent, accessControlManager.address, protocolShareReserve.address],
    {
      constructorArgs: [comptroller.address, vBnb.address, wBnb.address, comptrollerLens.address],
    },
  );

  return { comptroller, vBnb, vTokenCollateral, liquidator, wBnb, underlying };
}

function configure(fixture: LiquidatorFixture) {
  const { comptroller, vTokenCollateral } = fixture;
  comptroller["getDynamicLiquidationIncentive(address,uint256,uint256)"]
    .whenCalledWith(vTokenCollateral.address, 0, 0)
    .returns(announcedIncentive);
  vTokenCollateral.transfer.reset();
  vTokenCollateral.transfer.returns(true);
}

function calculateSplitSeizedTokens(amount: bigint) {
  const treasuryDelta =
    (amount * (announcedIncentive - MANTISSA_ONE) * treasuryPercent) / (announcedIncentive * MANTISSA_ONE);
  const liquidatorDelta = amount - treasuryDelta;
  return { treasuryDelta, liquidatorDelta };
}

describe("Liquidator", () => {
  let liquidator: SignerWithAddress;
  let vTokenCollateral: FakeContract<VBep20Immutable>;
  let liquidatorContract: MockContract<LiquidatorHarness>;
  let underlying: FakeContract<FaucetToken>;
  beforeEach(async () => {
    [liquidator] = await ethers.getSigners();
    const contracts = await loadFixture(deployLiquidator);
    configure(contracts);
    ({ vTokenCollateral, liquidator: liquidatorContract, underlying } = contracts);
    const [borrowerSigner] = await ethers.getSigners();
  });

  describe("splitLiquidationIncentive", () => {
    it("splits liquidationIncentive between Treasury and Liquidator with correct amounts", async () => {
      const splitResponse = await liquidatorContract.splitLiquidationIncentive(seizeTokens, announcedIncentive);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(splitResponse["ours"]).to.equal(expectedData.treasuryDelta);
      expect(splitResponse["theirs"]).to.equal(expectedData.liquidatorDelta);
    });
  });

  describe("distributeLiquidationIncentive", () => {
    it("distributes the liquidationIncentive between Treasury and Liquidator with correct amounts", async () => {
      const tx = await liquidatorContract.distributeLiquidationIncentive(
        vTokenCollateral.address,
        seizeTokens,
        announcedIncentive,
      );
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      expect(vTokenCollateral.transfer).to.have.been.calledWith(liquidator.address, expectedData.liquidatorDelta);
      expect(underlying.transfer).to.have.been.calledOnce;
      await expect(tx)
        .to.emit(liquidatorContract, "DistributeLiquidationIncentive")
        .withArgs(expectedData.treasuryDelta, expectedData.liquidatorDelta);
    });

    it("reverts if transfer to liquidator fails", async () => {
      vTokenCollateral.transfer.returnsAtCall(0, false);
      const expectedData = calculateSplitSeizedTokens(seizeTokens);
      await expect(
        liquidatorContract.distributeLiquidationIncentive(vTokenCollateral.address, seizeTokens, announcedIncentive),
      )
        .to.be.revertedWithCustomError(liquidatorContract, "VTokenTransferFailed")
        .withArgs(liquidatorContract.address, liquidator.address, expectedData.liquidatorDelta);
    });

    it("reverts if underlying transfer to protocol share reserves fails", async () => {
      underlying.transfer.returns(false);
      await expect(
        liquidatorContract.distributeLiquidationIncentive(vTokenCollateral.address, seizeTokens, announcedIncentive),
      ).to.be.revertedWith("SafeERC20: ERC20 operation did not succeed");
    });
  });
});
