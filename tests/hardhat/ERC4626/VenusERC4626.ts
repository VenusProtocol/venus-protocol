import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  AccessControlManagerMock,
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
  let vaultOwner: SignerWithAddress;
  let venusERC4626: MockVenusERC4626;
  let asset: FakeContract<ERC20>;
  let xvs: FakeContract<ERC20>;
  let vToken: FakeContract<VBep20Immutable>;
  let comptroller: FakeContract<ComptrollerInterface>;
  let accessControlManager: FakeContract<AccessControlManagerMock>;
  let rewardRecipient: string;
  let rewardRecipientPSR: FakeContract<IProtocolShareReserve>;

  beforeEach(async () => {
    [deployer, user, vaultOwner] = await ethers.getSigners();

    // Create Smock Fake Contracts
    asset = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    xvs = await smock.fake<ERC20>("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vToken = await smock.fake<VBep20Immutable>("contracts/Tokens/VTokens/VBep20Immutable.sol:VBep20Immutable");
    comptroller = await smock.fake<ComptrollerInterface>(
      "contracts/ERC4626/interfaces/ComptrollerInterface.sol:ComptrollerInterface",
    );
    accessControlManager = await smock.fake("AccessControlManagerMock");
    rewardRecipient = deployer.address;
    rewardRecipientPSR = await smock.fake<IProtocolShareReserve>("contracts/InterfacesV8.sol:IProtocolShareReserve");

    // Configure mock behaviors
    accessControlManager.isAllowedToCall.returns(true);
    vToken.underlying.returns(asset.address);
    vToken.comptroller.returns(comptroller.address);

    // Deploy and initialize MockVenusERC4626
    const VenusERC4626Factory = await ethers.getContractFactory("MockVenusERC4626");

    venusERC4626 = await upgrades.deployProxy(VenusERC4626Factory, [vToken.address], {
      initializer: "initialize",
    });

    await venusERC4626.initialize2(accessControlManager.address, rewardRecipient, vaultOwner.address);
  });

  describe("Initialization", () => {
    it("should deploy with correct parameters", async () => {
      expect(venusERC4626.address).to.not.equal(ethers.constants.AddressZero);
      expect(await venusERC4626.asset()).to.equal(asset.address);
      expect(await venusERC4626.vToken()).to.equal(vToken.address);
      expect(await venusERC4626.comptroller()).to.equal(comptroller.address);
      expect(await venusERC4626.rewardRecipient()).to.equal(rewardRecipient);
      expect(await venusERC4626.accessControlManager()).to.equal(accessControlManager.address);
      expect(await venusERC4626.owner()).to.equal(vaultOwner.address);
    });
  });

  describe("Access Control", () => {
    it("should allow authorized accounts to update reward recipient", async () => {
      const newRecipient = ethers.Wallet.createRandom().address;
      await expect(venusERC4626.setRewardRecipient(newRecipient))
        .to.emit(venusERC4626, "RewardRecipientUpdated")
        .withArgs(rewardRecipient, newRecipient);
    });
  });

  describe("Mint Operations", () => {
    const testShares = ethers.utils.parseEther("10");
    let expectedAssets: ethers.BigNumber;

    beforeEach(async () => {
      asset.transferFrom.returns(true);
      asset.approve.returns(true);
      vToken.mint.returns(0); // NO_ERROR
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      expectedAssets = await venusERC4626.previewMint(testShares);

      await venusERC4626.setMaxMint(ethers.utils.parseEther("100")); // Sets max shares
    });

    it("should mint shares successfully", async () => {
      await expect(venusERC4626.connect(user).mint(testShares, user.address))
        .to.emit(venusERC4626, "Deposit")
        .withArgs(user.address, user.address, expectedAssets, testShares);

      expect(vToken.mint).to.have.been.calledWith(expectedAssets);
      expect(await venusERC4626.balanceOf(user.address)).to.equal(testShares);
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
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));
      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
    });

    it("should deposit assets successfully", async () => {
      const depositAmount = ethers.utils.parseUnits("10", 18);

      const expectedShares = await venusERC4626.previewDeposit(depositAmount);

      await expect(venusERC4626.connect(user).deposit(depositAmount, user.address))
        .to.emit(venusERC4626, "Deposit")
        .withArgs(user.address, user.address, depositAmount, expectedShares);

      expect(vToken.mint).to.have.been.calledWith(depositAmount);
      expect(await venusERC4626.balanceOf(user.address)).to.equal(expectedShares);
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
      asset.transfer.returns(true);

      asset.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      asset.balanceOf.returnsAtCall(1, depositAmount.sub(withdrawAmount));

      vToken.mint.returns(0);
      vToken.redeemUnderlying.returns(0);
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
      await venusERC4626.connect(user).deposit(depositAmount, user.address);
      await venusERC4626.setTotalAssets(depositAmount);
      await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("15"));
    });

    it("should withdraw assets successfully", async () => {
      const expectedShares = await venusERC4626.previewWithdraw(withdrawAmount);

      await expect(venusERC4626.connect(user).withdraw(withdrawAmount, user.address, user.address))
        .to.emit(venusERC4626, "Withdraw")
        .withArgs(user.address, user.address, user.address, withdrawAmount, expectedShares);

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
      asset.transfer.returns(true);

      vToken.mint.returns(0); // NO_ERROR
      vToken.redeemUnderlying.returns(0);
      vToken.exchangeRateStored.returns(ethers.utils.parseUnits("1.0001", 18));

      await venusERC4626.setMaxDeposit(ethers.utils.parseEther("50"));
      await venusERC4626.setMaxRedeem(ethers.utils.parseEther("50"));
      await venusERC4626.connect(user).deposit(depositAmount, user.address);
      await venusERC4626.setTotalAssets(depositAmount);
      await venusERC4626.setMaxWithdraw(ethers.utils.parseEther("15"));

      expectedRedeemAssets = await venusERC4626.previewRedeem(redeemShares);

      asset.balanceOf.returnsAtCall(0, ethers.BigNumber.from(0));
      asset.balanceOf.returnsAtCall(1, expectedRedeemAssets);
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
        venusERC4626WithPSR = await upgrades.deployProxy(VenusERC4626Factory, [vToken.address], {
          initializer: "initialize",
        });

        await venusERC4626WithPSR.initialize2(
          accessControlManager.address,
          rewardRecipientPSR.address,
          vaultOwner.address,
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
