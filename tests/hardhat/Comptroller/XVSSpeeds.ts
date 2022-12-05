import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { ethers, network } from "hardhat";

import { Comptroller, Comptroller__factory, IAccessControlManager, VToken } from "../../../typechain";
import { convertToUnit } from "./../../../helpers/utils";

const { expect } = chai;
chai.use(smock.matchers);

describe("Comptroller", () => {
  let comptroller: MockContract<Comptroller>;
  let accessControl: FakeContract<IAccessControlManager>;
  let vToken1: FakeContract<VToken>;
  let vToken2: FakeContract<VToken>;

  beforeEach(async () => {
    const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    comptroller = await ComptrollerFactory.deploy();
    accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
    vToken1 = await smock.fake<VToken>("VToken");
    vToken2 = await smock.fake<VToken>("VToken");

    await accessControl.isAllowedToCall.returns(true);
    await vToken1.isVToken.returns(true);
    await vToken2.isVToken.returns(true);
    await vToken1.borrowIndex.returns(convertToUnit(0.7, 18));

    await comptroller._setAccessControl(accessControl.address);
    await comptroller._supportMarket(vToken1.address);
    await comptroller._supportMarket(vToken2.address);
  });

  describe("_initializeMarket", () => {
    it("Supply and borrow state after initializing the market in the pool", async () => {
      const supplyRate = await (await comptroller.venusSupplyState(vToken1.address)).toString().split(",")[0];
      const borrowRate = await (await comptroller.venusBorrowState(vToken1.address)).toString().split(",")[0];

      expect(supplyRate).equal(convertToUnit(1, 36));
      expect(borrowRate).equal(convertToUnit(1, 36));
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
      ).to.be.revertedWith("Comptroller::_setVenusSpeeds invalid input");
    });

    it("Revert on invalid borrowSpeeds input", async () => {
      await expect(
        comptroller._setVenusSpeeds(
          [vToken1.address, vToken2.address],
          [convertToUnit(1, 15), convertToUnit(1, 15)],
          [convertToUnit(1, 15)],
        ),
      ).to.be.revertedWith("Comptroller::_setVenusSpeeds invalid input");
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
      const supplySpeedBlock1 = await (await comptroller.venusSupplyState(vToken1.address)).toString().split(",")[1];
      const borrowSpeedBlock1 = await (await comptroller.venusBorrowState(vToken1.address)).toString().split(",")[1];

      // Updating the speeds to non-zero
      await comptroller._setVenusSpeeds([vToken1.address], [convertToUnit(1, 16)], [convertToUnit(1, 20)]);

      // Getting the last block for the updated speeds
      const supplySpeedBlock2 = await (await comptroller.venusSupplyState(vToken1.address)).toString().split(",")[1];
      const borrowSpeedBlock2 = await (await comptroller.venusBorrowState(vToken1.address)).toString().split(",")[1];
      // latest Block
      const blockNumber2 = await ethers.provider.getBlock("latest");

      expect(blockNumber2.number - blockNumber1.number).equal(Number(supplySpeedBlock2) - Number(supplySpeedBlock1));
      expect(blockNumber2.number - blockNumber1.number).equal(Number(borrowSpeedBlock2) - Number(borrowSpeedBlock1));
    });
  });
});
