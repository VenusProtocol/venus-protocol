import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FaucetToken, IAccessControlManagerV5 } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VToken", function () {
  let root, nonAdmin;
  let vToken: Contract;
  let underlying: FaucetToken;
  let acmMock: Contract; // Real AccessControlManagerMock (owner-only)
  let acmFake: FakeContract<IAccessControlManagerV5>; // Smock fake for non-assembly paths

  beforeEach(async () => {
    [root, nonAdmin] = await ethers.getSigners();

    const comptroller = await smock.fake("contracts/Comptroller/ComptrollerInterface.sol:ComptrollerInterface");
    comptroller.isComptroller.returns(true);

    // Deploy real ACM mock (allows owner, denies others) for sweepToken assembly calls
    const acmFactory = await ethers.getContractFactory("AccessControlManagerMock");
    acmMock = await acmFactory.deploy(root.address);

    const psr = await smock.fake("IProtocolShareReserve");

    // Deploy underlying token
    const faucetTokenFactory = await ethers.getContractFactory("FaucetToken");
    underlying = (await faucetTokenFactory.deploy(parseUnits("1000000", 18), "TestToken", 18, "TT")) as FaucetToken;

    // Deploy interest rate model
    const irmFactory = await ethers.getContractFactory("JumpRateModel");
    const irm = await irmFactory.deploy(
      parseUnits("0.05", 18),
      parseUnits("0.8", 18),
      parseUnits("3", 18),
      parseUnits("0.7", 18),
      10512000,
    );

    // Deploy VBep20Delegate implementation + VBep20Delegator proxy
    const delegateFactory = await ethers.getContractFactory("VBep20Delegate");
    const delegate = await delegateFactory.deploy();

    const delegatorFactory = await ethers.getContractFactory("VBep20Delegator");
    const delegator = await delegatorFactory.deploy(
      underlying.address,
      comptroller.address,
      irm.address,
      parseUnits("1", 18),
      "VToken",
      "VT",
      8,
      root.address,
      delegate.address,
      "0x",
    );

    // Interact with delegator using delegate ABI
    vToken = await ethers.getContractAt("VBep20Delegate", delegator.address);

    // Use real ACM for sweepToken assembly compatibility
    await vToken.setAccessControlManager(acmMock.address);
    await vToken.setProtocolShareReserve(psr.address);
  });

  describe("syncCash", () => {
    it("sets internalCash to actual token balance", async () => {
      const amount = parseUnits("100", 18);
      await underlying.allocateTo(vToken.address, amount);

      expect(await vToken.internalCash()).to.equal(0);
      await vToken.syncCash();
      expect(await vToken.internalCash()).to.equal(amount);
    });

    it("emits CashSynced event", async () => {
      const amount = parseUnits("50", 18);
      await underlying.allocateTo(vToken.address, amount);

      await expect(vToken.syncCash()).to.emit(vToken, "CashSynced").withArgs(0, amount);
    });

    it("reverts when called by non-admin", async () => {
      await expect(vToken.connect(nonAdmin).syncCash()).to.be.revertedWith("only admin");
    });

    it("can be called multiple times (idempotent)", async () => {
      const amount = parseUnits("100", 18);
      await underlying.allocateTo(vToken.address, amount);

      await vToken.syncCash();
      expect(await vToken.internalCash()).to.equal(amount);

      await expect(vToken.syncCash()).to.emit(vToken, "CashSynced").withArgs(amount, amount);
      expect(await vToken.internalCash()).to.equal(amount);
    });

    it("re-syncs after a donation absorbing excess into accounting", async () => {
      const initial = parseUnits("100", 18);
      await underlying.allocateTo(vToken.address, initial);
      await vToken.syncCash();

      const donation = parseUnits("50", 18);
      await underlying.allocateTo(vToken.address, donation);
      expect(await vToken.internalCash()).to.equal(initial);

      await expect(vToken.syncCash())
        .to.emit(vToken, "CashSynced")
        .withArgs(initial, initial.add(donation));
      expect(await vToken.internalCash()).to.equal(initial.add(donation));
    });

    it("works when balance is zero", async () => {
      await expect(vToken.syncCash()).to.emit(vToken, "CashSynced").withArgs(0, 0);
      expect(await vToken.internalCash()).to.equal(0);
    });
  });

  describe("sweepToken", () => {
    const initialCash = parseUnits("100", 18);
    const donation = parseUnits("30", 18);

    beforeEach(async () => {
      await underlying.allocateTo(vToken.address, initialCash);
      await vToken.syncCash();
    });

    it("recovers excess tokens and emits TokenSwept", async () => {
      await underlying.allocateTo(vToken.address, donation);

      const balanceBefore = await underlying.balanceOf(root.address);
      await expect(vToken.sweepToken()).to.emit(vToken, "TokenSwept").withArgs(root.address, donation);
      const balanceAfter = await underlying.balanceOf(root.address);

      expect(balanceAfter.sub(balanceBefore)).to.equal(donation);
    });

    it("does not change internalCash after sweep", async () => {
      await underlying.allocateTo(vToken.address, donation);
      await vToken.sweepToken();

      expect(await vToken.internalCash()).to.equal(initialCash);
    });

    it("reverts when there is no excess", async () => {
      await expect(vToken.sweepToken()).to.be.reverted;
    });

    it("reverts when ACM denies access (non-owner caller)", async () => {
      await underlying.allocateTo(vToken.address, donation);
      // AccessControlManagerMock only allows owner (root), denies nonAdmin
      await expect(vToken.connect(nonAdmin).sweepToken()).to.be.reverted;
    });

    it("sweeps exact excess when multiple donations occur", async () => {
      const donation2 = parseUnits("20", 18);
      await underlying.allocateTo(vToken.address, donation);
      await underlying.allocateTo(vToken.address, donation2);

      const totalExcess = donation.add(donation2);
      await expect(vToken.sweepToken()).to.emit(vToken, "TokenSwept").withArgs(root.address, totalExcess);

      expect(await underlying.balanceOf(vToken.address)).to.equal(initialCash);
    });

    it("can sweep again after a new donation", async () => {
      await underlying.allocateTo(vToken.address, donation);
      await vToken.sweepToken();

      const donation2 = parseUnits("10", 18);
      await underlying.allocateTo(vToken.address, donation2);

      await expect(vToken.sweepToken()).to.emit(vToken, "TokenSwept").withArgs(root.address, donation2);
    });
  });
});
