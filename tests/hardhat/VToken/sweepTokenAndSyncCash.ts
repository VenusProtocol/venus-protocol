import { smock } from "@defi-wonderland/smock";
import chai from "chai";
import { Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FaucetToken } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("VToken", function () {
  let root, nonAdmin;
  let vToken: Contract;
  let underlying: FaucetToken;

  beforeEach(async () => {
    [root, nonAdmin] = await ethers.getSigners();

    const comptroller = await smock.fake("contracts/Comptroller/ComptrollerInterface.sol:ComptrollerInterface");
    comptroller.isComptroller.returns(true);

    const psr = await smock.fake("IProtocolShareReserve");

    const faucetTokenFactory = await ethers.getContractFactory("FaucetToken");
    underlying = (await faucetTokenFactory.deploy(parseUnits("1000000", 18), "TestToken", 18, "TT")) as FaucetToken;

    const irmFactory = await ethers.getContractFactory("JumpRateModel");
    const irm = await irmFactory.deploy(
      parseUnits("0.05", 18),
      parseUnits("0.8", 18),
      parseUnits("3", 18),
      parseUnits("0.7", 18),
      10512000,
    );

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

    vToken = await ethers.getContractAt("VBep20Delegate", delegator.address);
    await vToken.setProtocolShareReserve(psr.address);
  });

  describe("sweepTokenAndSync", () => {
    describe("sync (transferAmount = 0)", () => {
      it("sets internalCash to actual token balance", async () => {
        const amount = parseUnits("100", 18);
        await underlying.allocateTo(vToken.address, amount);

        expect(await vToken.internalCash()).to.equal(0);
        await vToken.sweepTokenAndSync(0);
        expect(await vToken.internalCash()).to.equal(amount);
      });

      it("emits CashSynced event", async () => {
        const amount = parseUnits("50", 18);
        await underlying.allocateTo(vToken.address, amount);

        await expect(vToken.sweepTokenAndSync(0)).to.emit(vToken, "CashSynced").withArgs(0, amount);
      });

      it("reverts when called by non-admin", async () => {
        await expect(vToken.connect(nonAdmin).sweepTokenAndSync(0)).to.be.reverted;
      });

      it("is idempotent", async () => {
        const amount = parseUnits("100", 18);
        await underlying.allocateTo(vToken.address, amount);

        await vToken.sweepTokenAndSync(0);
        expect(await vToken.internalCash()).to.equal(amount);

        await expect(vToken.sweepTokenAndSync(0)).to.emit(vToken, "CashSynced").withArgs(amount, amount);
        expect(await vToken.internalCash()).to.equal(amount);
      });

      it("works when balance is zero", async () => {
        await expect(vToken.sweepTokenAndSync(0)).to.emit(vToken, "CashSynced").withArgs(0, 0);
        expect(await vToken.internalCash()).to.equal(0);
      });
    });

    describe("sweep (transferAmount > 0)", () => {
      const initialCash = parseUnits("100", 18);
      const donation = parseUnits("30", 18);

      beforeEach(async () => {
        await underlying.allocateTo(vToken.address, initialCash);
        await vToken.sweepTokenAndSync(0);
      });

      it("recovers excess tokens and emits TokenSwept + CashSynced", async () => {
        await underlying.allocateTo(vToken.address, donation);

        const balanceBefore = await underlying.balanceOf(root.address);
        const tx = vToken.sweepTokenAndSync(donation);
        await expect(tx).to.emit(vToken, "TokenSwept").withArgs(root.address, donation);
        await expect(tx).to.emit(vToken, "CashSynced").withArgs(initialCash, initialCash);
        const balanceAfter = await underlying.balanceOf(root.address);

        expect(balanceAfter.sub(balanceBefore)).to.equal(donation);
      });

      it("internalCash unchanged after sweeping exact excess", async () => {
        await underlying.allocateTo(vToken.address, donation);
        await vToken.sweepTokenAndSync(donation);

        expect(await vToken.internalCash()).to.equal(initialCash);
      });

      it("reverts when transferAmount exceeds balance", async () => {
        const balance = await underlying.balanceOf(vToken.address);
        await expect(vToken.sweepTokenAndSync(balance.add(1))).to.be.reverted;
      });

      it("reverts when called by non-admin", async () => {
        await underlying.allocateTo(vToken.address, donation);
        await expect(vToken.connect(nonAdmin).sweepTokenAndSync(donation)).to.be.reverted;
      });

      it("sweeps exact excess when multiple donations occur", async () => {
        const donation2 = parseUnits("20", 18);
        await underlying.allocateTo(vToken.address, donation);
        await underlying.allocateTo(vToken.address, donation2);

        const totalExcess = donation.add(donation2);
        await expect(vToken.sweepTokenAndSync(totalExcess))
          .to.emit(vToken, "TokenSwept")
          .withArgs(root.address, totalExcess);

        expect(await underlying.balanceOf(vToken.address)).to.equal(initialCash);
        expect(await vToken.internalCash()).to.equal(initialCash);
      });

      it("can sweep again after a new donation", async () => {
        await underlying.allocateTo(vToken.address, donation);
        await vToken.sweepTokenAndSync(donation);

        const donation2 = parseUnits("10", 18);
        await underlying.allocateTo(vToken.address, donation2);

        await expect(vToken.sweepTokenAndSync(donation2))
          .to.emit(vToken, "TokenSwept")
          .withArgs(root.address, donation2);
      });
    });
  });
});
