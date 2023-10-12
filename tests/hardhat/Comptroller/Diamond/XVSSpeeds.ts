import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { ethers, network } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import { ComptrollerMock, IAccessControlManager, Unitroller, VToken } from "../../../../typechain";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

describe("Comptroller", () => {
  let unitroller: Unitroller;
  let comptroller: ComptrollerMock;
  let accessControl: FakeContract<IAccessControlManager>;
  let vToken1: FakeContract<VToken>;
  let vToken2: FakeContract<VToken>;

  beforeEach(async () => {
    const result = await deployDiamond("");
    unitroller = result.unitroller;

    comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    accessControl = await smock.fake<IAccessControlManager>(
      "contracts/Governance/IAccessControlManager.sol:IAccessControlManager",
    );
    vToken1 = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");
    vToken2 = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");

    accessControl.isAllowedToCall.returns(true);
    vToken1.isVToken.returns(true);
    vToken2.isVToken.returns(true);
    vToken1.borrowIndex.returns(convertToUnit(0.7, 18));

    await comptroller._setAccessControl(accessControl.address);
    await comptroller._supportMarket(vToken1.address);
    await comptroller._supportMarket(vToken2.address);
  });

  describe("_initializeMarket", () => {
    it("Supply and borrow state after initializing the market in the pool", async () => {
      const borrowRate = await comptroller.venusSupplyState(vToken1.address);
      const supplyRate = await comptroller.venusBorrowState(vToken1.address);
      expect(supplyRate.index).equal(convertToUnit(1, 36));
      expect(borrowRate.index).equal(convertToUnit(1, 36));
    });
  });

  describe("_setVenusSpeeds", async () => {
    it("Revert on invalid supplySpeeds input", async () => {
      await expect(
        comptroller._setVenusSpeeds(
          [vToken1.address, vToken2.address],
          [convertToUnit(1, 15)],
          [convertToUnit(1, 15), convertToUnit(1, 15)],
        ),
      ).to.be.revertedWith("invalid input");
    });

    it("Revert on invalid borrowSpeeds input", async () => {
      await expect(
        comptroller._setVenusSpeeds(
          [vToken1.address, vToken2.address],
          [convertToUnit(1, 15), convertToUnit(1, 15)],
          [convertToUnit(1, 15)],
        ),
      ).to.be.revertedWith("invalid input");
    });

    it("Revert for unlisted market", async () => {
      const [unListedMarket] = await ethers.getSigners();
      await expect(
        comptroller._setVenusSpeeds([unListedMarket.address], [convertToUnit(1, 16)], [convertToUnit(1, 15)]),
      ).to.be.revertedWith("market not listed");
    });

    it("Revert on invalid borrowSpeeds input", async () => {
      await comptroller._setVenusSpeeds(
        [vToken1.address, vToken2.address],
        [convertToUnit(1, 16), convertToUnit(1, 18)],
        [convertToUnit(1, 20), convertToUnit(1, 22)],
      );

      const token1SupplySpeed = await comptroller.venusSupplySpeeds(vToken1.address);
      const token1BorrowSpeed = await comptroller.venusBorrowSpeeds(vToken1.address);

      expect(token1SupplySpeed).equal(convertToUnit(1, 16));
      expect(token1BorrowSpeed).equal(convertToUnit(1, 20));

      const token2SupplySpeed = await comptroller.venusSupplySpeeds(vToken2.address);
      const token2BorrowSpeed = await comptroller.venusBorrowSpeeds(vToken2.address);

      expect(token2SupplySpeed).equal(convertToUnit(1, 18));
      expect(token2BorrowSpeed).equal(convertToUnit(1, 22));
    });

    it("Updating non-zero speeds after setting it zero", async () => {
      // Setting the initial speeds
      await comptroller._setVenusSpeeds([vToken1.address], [convertToUnit(1, 16)], [convertToUnit(1, 20)]);

      // Mining 1000 blocks
      await network.provider.send("hardhat_mine", ["0x3e8", "0x3c"]);

      // Updating the speeds to zero
      await comptroller._setVenusSpeeds([vToken1.address], [0], [0]);

      // latest Block
      const blockNumber1 = await ethers.provider.getBlock("latest");
      // Mining 1000 blocks
      await network.provider.send("hardhat_mine", ["0x3e8", "0x3c"]);
      // Getting the last block for the updated speeds
      const supplySpeedBlock1 = await comptroller.venusSupplyState(vToken1.address);
      const borrowSpeedBlock1 = await comptroller.venusBorrowState(vToken1.address);

      // Updating the speeds to non-zero
      await comptroller._setVenusSpeeds([vToken1.address], [convertToUnit(1, 16)], [convertToUnit(1, 20)]);

      // Getting the last block for the updated speeds
      const supplySpeedBlock2 = await comptroller.venusSupplyState(vToken1.address);
      const borrowSpeedBlock2 = await comptroller.venusBorrowState(vToken1.address);
      // latest Block
      const blockNumber2 = await ethers.provider.getBlock("latest");

      expect(blockNumber2.number - blockNumber1.number).equal(
        Number(supplySpeedBlock2.block) - Number(supplySpeedBlock1.block),
      );
      expect(blockNumber2.number - blockNumber1.number).equal(
        Number(borrowSpeedBlock2.block) - Number(borrowSpeedBlock1.block),
      );
    });
  });
});
