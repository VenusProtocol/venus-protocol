import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ComptrollerInterface,
  ERC20,
  IProtocolShareReserve,
  MockVenusERC4626,
  VBep20Immutable,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626", () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let venusERC4626: MockVenusERC4626;
  let asset: FakeContract<ERC20>;
  let xvs: FakeContract<ERC20>;
  let vToken: FakeContract<VBep20Immutable>;
  let comptroller: FakeContract<ComptrollerInterface>;
  let rewardRecipient: string;
  let rewardRecipientPSR: FakeContract<IProtocolShareReserve>;

  beforeEach(async () => {
    [deployer, user] = await ethers.getSigners();

    // Create Smock Fake Contracts
    asset = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    xvs = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake<VBep20Immutable>("contracts/Tokens/VTokens/VBep20Immutable.sol:VBep20Immutable");
    comptroller = await smock.fake<ComptrollerInterface>(
      "contracts/ERC4626/interfaces/ComptrollerInterface.sol:ComptrollerInterface",
    );
    rewardRecipient = deployer.address;
    rewardRecipientPSR = await smock.fake<IProtocolShareReserve>("contracts/InterfacesV8.sol:IProtocolShareReserve");

    // Configure mock behaviors
    vToken.underlying.returns(asset.address);
    vToken.comptroller.returns(comptroller.address);

    // Deploy and initialize MockVenusERC4626
    const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");

    venusERC4626 = await upgrades.deployProxy(VenusERC4626Factory, [vToken.address, rewardRecipient], {
      initializer: "initialize",
    });
  });

  describe("Initialization", () => {
    it("should deploy with correct parameters", async () => {
      expect(venusERC4626.address).to.not.equal(ethers.constants.AddressZero);
      expect(await venusERC4626.asset()).to.equal(asset.address);
      expect(await venusERC4626.vToken()).to.equal(vToken.address);
      expect(await venusERC4626.comptroller()).to.equal(comptroller.address);
      expect(await venusERC4626.rewardRecipient()).to.equal(rewardRecipient);
    });
  });

  describe("Mint Operations", () => {
    const testShares = ethers.utils.parseEther("10");
    let expectedAssets: ethers.BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      vToken.mint.returns(0); // NO_ERROR

      const decimalsOffset = await venusERC4626.getDecimalsOffset();
      expectedAssets = testShares.div(ethers.BigNumber.from(10).pow(decimalsOffset));

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("100")); // Sets max assets
      await venusERC4626.setMaxMint(ethers.utils.parseEther("100")); // Sets max shares
    });

    it("should mint shares successfully", async () => {
      await expect(venusERC4626.connect(user).mint(testShares, user.address))
        .to.emit(venusERC4626, "Deposit")
        .withArgs(user.address, user.address, expectedAssets, testShares);

      expect(vToken.mint).to.have.been.calledWith(expectedAssets);
    });

    it("should return correct assets amount", async () => {
      const returnedAssets = await venusERC4626.connect(user).callStatic.mint(testShares, user.address);
      expect(returnedAssets).to.equal(expectedAssets);
    });

    it("should revert if vToken mint fails", async () => {
      vToken.mint.returns(1); // Error code 1
      await expect(venusERC4626.connect(user).mint(testShares, user.address)).to.be.revertedWithCustomError(
        venusERC4626,
        "VenusERC4626__VenusError",
      );
    });

    it("should fail mint with no approval", async () => {
      asset.transferFrom.returns(false);
      await expect(venusERC4626.connect(user).mint(testShares, user.address)).to.be.reverted;
    });

    it("should fail mint zero shares", async () => {
      await expect(venusERC4626.connect(user).mint(0, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("mint");
    });
  });

  describe("Deposit Operations", () => {
    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      vToken.mint.returns(0); // NO_ERROR
      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
    });

    it("should deposit assets successfully", async () => {
      const depositAmount = ethers.utils.parseUnits("10", 18);
      const decimalsOffset = await venusERC4626.getDecimalsOffset();
      const expectedDepositAmount = depositAmount.mul(ethers.BigNumber.from(10).pow(decimalsOffset));

      await expect(venusERC4626.connect(user).deposit(depositAmount, user.address))
        .to.emit(venusERC4626, "Deposit")
        .withArgs(user.address, user.address, depositAmount, expectedDepositAmount);

      expect(vToken.mint).to.have.been.calledWith(depositAmount);
    });

    it("should revert if vToken mint fails", async () => {
      vToken.mint.returns(1); // Error code 1
      await expect(
        venusERC4626.connect(user).deposit(ethers.utils.parseEther("50"), user.address),
      ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
    });

    it("should fail deposit with no approval", async () => {
      asset.transferFrom.returns(false);
      await expect(venusERC4626.connect(user).deposit(ethers.utils.parseEther("1"), user.address)).to.be.reverted;
    });

    it("should fail deposit zero amount", async () => {
      await expect(venusERC4626.connect(user).deposit(0, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("deposit");
    });
  });

  describe("Withdraw Operations", () => {
    const depositAmount = ethers.utils.parseEther("10");
    const withdrawAmount = ethers.utils.parseEther("5");

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      vToken.mint.returns(0);
      vToken.redeemUnderlying.returns(0);
      asset.transfer.returns(true);

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
      await venusERC4626.connect(user).deposit(depositAmount, user.address);
      await venusERC4626.setTotalAssets(depositAmount);
      await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("15"));
    });

    it("should withdraw assets successfully", async () => {
      const decimalsOffset = await venusERC4626.getDecimalsOffset();
      const expectedWithdrawAmount = withdrawAmount.mul(ethers.BigNumber.from(10).pow(decimalsOffset));

      await expect(venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address))
        .to.emit(venusERC4626, "Withdraw")
        .withArgs(user.address, user.address, user.address, withdrawAmount, expectedWithdrawAmount);

      expect(vToken.redeemUnderlying).to.have.been.calledWith(withdrawAmount);
    });

    it("should revert if vToken redeemUnderlying fails", async () => {
      vToken.redeemUnderlying.returns(1); // Error code 1
      await expect(
        venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address),
      ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
    });

    it("should fail withdraw with no balance", async () => {
      await venusERC4626.setTotalAssets(0);
      await expect(venusERC4626.connect(user).withdraw(ethers.utils.parseEther("1"), user.address, user.address)).to.be
        .reverted;
    });

    it("should fail withdraw zero amount", async () => {
      await expect(venusERC4626.connect(user).withdraw(0, user.address, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("withdraw");
    });
  });

  describe("Redeem Operations", () => {
    const depositAmount = ethers.utils.parseEther("10");
    const redeemShares = ethers.utils.parseEther("5");
    let expectedRedeemAssets: ethers.BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      vToken.mint.returns(0);
      vToken.redeemUnderlying.returns(0);
      asset.transfer.returns(true);

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
      await venusERC4626.setMaxRedeem(ethers.utils.parseEther("50"));
      await venusERC4626.connect(user).deposit(depositAmount, user.address);
      await venusERC4626.setTotalAssets(depositAmount);
      await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("15"));

      const decimalsOffset = await venusERC4626.getDecimalsOffset();
      expectedRedeemAssets = redeemShares.div(ethers.BigNumber.from(10).pow(decimalsOffset));
    });

    it("should redeem shares successfully", async () => {
      await expect(venusERC4626.connect(user).redeem(redeemShares, user.address, user.address))
        .to.emit(venusERC4626, "Withdraw")
        .withArgs(user.address, user.address, user.address, expectedRedeemAssets, redeemShares);

      expect(vToken.redeemUnderlying).to.have.been.calledWith(expectedRedeemAssets);
    });

    it("should return correct assets amount", async () => {
      const returnedAssets = await venusERC4626
        .connect(user)
        .callStatic.redeem(redeemShares, user.address, user.address);
      expect(returnedAssets).to.equal(expectedRedeemAssets);
    });

    it("should revert if vToken redeemUnderlying fails", async () => {
      vToken.redeemUnderlying.returns(1); // Error code 1
      await expect(
        venusERC4626.connect(user).redeem(redeemShares, user.address, user.address),
      ).to.be.revertedWithCustomError(venusERC4626, "VenusERC4626__VenusError");
    });

    it("should fail redeem zero shares", async () => {
      await expect(venusERC4626.connect(user).redeem(0, user.address, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("redeem");
    });

    it("should fail redeem when resulting assets would be zero", async () => {
      // Force totalAssets to zero to make previewRedeem return 0
      await venusERC4626.setTotalAssets(0);
      await expect(venusERC4626.connect(user).redeem(redeemShares, user.address, user.address))
        .to.be.revertedWithCustomError(venusERC4626, "ERC4626__ZeroAmount")
        .withArgs("redeem");
    });
  });

  describe("Reward Distribution", () => {
    const rewardAmount = ethers.utils.parseEther("10");

    describe("When rewardRecipient is EOA", () => {
      it("should claim rewards and transfer to recipient", async () => {
        comptroller.getXVSAddress.returns(xvs.address);
        xvs.balanceOf.whenCalledWith(venusERC4626.address).returns(rewardAmount);
        xvs.transfer.returns(true);

        await expect(venusERC4626.claimRewards())
          .to.emit(venusERC4626, "ClaimRewards")
          .withArgs(rewardAmount, xvs.address);

        expect(comptroller.claimVenus).to.have.been.calledWith(venusERC4626.address);

        expect(xvs.transfer).to.have.been.calledWith(rewardRecipient, rewardAmount);
        expect(rewardRecipientPSR.updateAssetsState).to.not.have.been.called;
      });
    });

    describe("When rewardRecipient is ProtocolShareReserve", () => {
      let venusERC4626WithPSR: MockVenusERC4626;

      beforeEach(async () => {
        // Deploy new instance with PSR as reward recipient
        const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");
        venusERC4626WithPSR = await upgrades.deployProxy(
          VenusERC4626Factory,
          [vToken.address, rewardRecipientPSR.address],
          { initializer: "initialize" },
        );

        comptroller.getXVSAddress.returns(xvs.address);
        xvs.balanceOf.whenCalledWith(venusERC4626WithPSR.address).returns(rewardAmount);
        xvs.transfer.returns(true);
      });

      it("should claim rewards and update PSR state", async () => {
        await expect(venusERC4626WithPSR.claimRewards())
          .to.emit(venusERC4626WithPSR, "ClaimRewards")
          .withArgs(rewardAmount, xvs.address);

        expect(comptroller.claimVenus).to.have.been.calledWith(venusERC4626WithPSR.address);
        expect(xvs.transfer).to.have.been.calledWith(rewardRecipientPSR.address, rewardAmount);

        // Verify PSR state update
        expect(rewardRecipientPSR.updateAssetsState).to.have.been.calledWith(
          comptroller.address,
          xvs.address,
          2, // ERC4626_WRAPPER_REWARDS
        );
      });
    });
  });
});
