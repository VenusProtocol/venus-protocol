import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ComptrollerInterface,
  ERC20,
  IAccessControlManagerV8,
  UpgradeableBeacon,
  VToken,
  VenusERC4626,
  VenusERC4626Factory,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VenusERC4626Factory", () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let factory: VenusERC4626Factory;
  let beacon: UpgradeableBeacon;
  let listedAsset: FakeContract<ERC20>;
  let vTokenA: FakeContract<VToken>;
  let vTokenB: FakeContract<VToken>;
  let fakeVToken: FakeContract<VToken>;
  let unlistedVToken: FakeContract<VToken>;
  let comptroller: FakeContract<ComptrollerInterface>;
  let accessControl: FakeContract<IAccessControlManagerV8>;
  let rewardRecipient: string;
  let venusERC4626Impl: VenusERC4626;

  beforeEach(async () => {
    [deployer, user] = await ethers.getSigners();

    listedAsset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vTokenA = await smock.fake("VToken");
    vTokenB = await smock.fake("VToken");
    fakeVToken = await smock.fake("VToken");
    unlistedVToken = await smock.fake("VToken");
    accessControl = await smock.fake("IAccessControlManagerV8");
    rewardRecipient = deployer.address;

    comptroller = await smock.fake<ComptrollerInterface>(
      "contracts/ERC4626/interfaces/ComptrollerInterface.sol:ComptrollerInterface",
    );

    accessControl.isAllowedToCall.returns(true);

    vTokenA.comptroller.returns(comptroller.address);
    vTokenA.underlying.returns(listedAsset.address);
    comptroller.markets.whenCalledWith(vTokenA.address).returns([true, 0]);

    const otherAsset = await smock.fake("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
    vTokenB.comptroller.returns(comptroller.address);
    vTokenB.underlying.returns(otherAsset.address);
    comptroller.markets.whenCalledWith(vTokenB.address).returns([true, 0]);

    fakeVToken.comptroller.returns(constants.AddressZero);

    unlistedVToken.comptroller.returns(comptroller.address);
    unlistedVToken.underlying.returns(ethers.Wallet.createRandom().address);
    comptroller.markets.whenCalledWith(unlistedVToken.address).returns([false, 0]);

    // Deploy implementation
    const VenusERC4626 = await ethers.getContractFactory("VenusERC4626");
    venusERC4626Impl = await VenusERC4626.deploy();
    await venusERC4626Impl.deployed();

    // Deploy factory
    const Factory = await ethers.getContractFactory("VenusERC4626Factory");
    factory = await upgrades.deployProxy(
      Factory,
      [accessControl.address, comptroller.address, rewardRecipient, venusERC4626Impl.address],
      { initializer: "initialize" },
    );

    beacon = await ethers.getContractAt("UpgradeableBeacon", await factory.beacon());
  });

  describe("Initialization", () => {
    it("should set correct initial values", async () => {
      expect(await factory.accessControlManager()).to.equal(accessControl.address);
      expect(await factory.comptroller()).to.equal(comptroller.address);
      expect(await factory.rewardRecipient()).to.equal(rewardRecipient);
    });

    it("should setup beacon proxy correctly", async () => {
      expect(await beacon.implementation()).to.equal(venusERC4626Impl.address);
    });

    it("should set the owner of the beacon to the owner of the factory", async () => {
      expect(await beacon.owner()).to.equal(await factory.owner());
    });
  });

  describe("Vault Creation", () => {
    it("should create vault and emit event", async () => {
      const tx = await factory.createERC4626(vTokenA.address);
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "CreateERC4626");

      expect(event?.args?.vToken).to.equal(vTokenA.address);
      expect(event?.args?.vault).to.not.equal(constants.AddressZero);
    });

    it("should set the owner of the vault", async () => {
      const tx = await factory.createERC4626(vTokenA.address);
      const receipt = await tx.wait();
      const deployed = receipt.events?.find(e => e.event === "CreateERC4626")?.args?.vault;

      const venusERC4626 = await ethers.getContractAt("VenusERC4626", deployed);

      expect(await venusERC4626.owner()).to.equal(await factory.owner());
    });

    it("should revert for zero vToken address", async () => {
      await expect(factory.createERC4626(constants.AddressZero)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddressNotAllowed",
      );
    });

    it("should revert for unlisted vToken", async () => {
      await expect(factory.createERC4626(unlistedVToken.address)).to.be.revertedWithCustomError(
        factory,
        "VenusERC4626Factory__InvalidVToken",
      );
    });
  });

  describe("CREATE2 Functionality", () => {
    it("should deploy to predicted address", async () => {
      const predicted = await factory.computeVaultAddress(vTokenA.address);
      const tx = await factory.createERC4626(vTokenA.address);
      const receipt = await tx.wait();
      const deployed = receipt.events?.find(e => e.event === "CreateERC4626")?.args?.vault;

      expect(deployed).to.equal(predicted);
    });

    it("should revert for deployment of same vToken", async () => {
      await factory.createERC4626(vTokenA.address);
      await expect(factory.createERC4626(vTokenA.address)).to.be.reverted;
    });

    it("Should not revert for deployment of different vTokens", async () => {
      await factory.createERC4626(vTokenA.address);
      await expect(factory.createERC4626(vTokenB.address));
    });
  });

  describe("Access Control", () => {
    it("should allow owner to update reward recipient", async () => {
      const newRecipient = ethers.Wallet.createRandom().address;
      await expect(factory.setRewardRecipient(newRecipient))
        .to.emit(factory, "RewardRecipientUpdated")
        .withArgs(rewardRecipient, newRecipient);
    });

    it("should revert when unauthorized user tries to update", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(factory.connect(user).setRewardRecipient(user.address)).to.be.revertedWithCustomError(
        factory,
        "Unauthorized",
      );
    });
  });

  describe("Beacon Proxy Verification", () => {
    it("should deploy valid BeaconProxy", async () => {
      // Deploy the vault
      const tx = await factory.createERC4626(vTokenA.address);
      const receipt = await tx.wait();
      const vaultAddress = receipt.events?.find(e => e.event === "CreateERC4626")?.args?.vault;

      // Verify proxy storage slot (EIP-1967)
      const beaconSlot = ethers.BigNumber.from(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes("eip1967.proxy.beacon")),
      ).sub(1);
      const beaconAddress = await ethers.provider.getStorageAt(vaultAddress, beaconSlot);

      // Storage returns 32 bytes, last 20 bytes are the address
      expect(ethers.utils.getAddress("0x" + beaconAddress.slice(-40))).to.equal(await factory.beacon());
    });
  });
});
