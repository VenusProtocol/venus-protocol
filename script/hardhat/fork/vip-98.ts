import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { Comptroller, VBep20, VBep20Delegator } from "../../../typechain";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384";
const OLD_VTRX = "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93";
const VTRX_RESETTER = "0x42178F50f838605E5B925A574ed8D630878F2EE1"; // A contract that updates the symbol and name
const VTOKEN_IMPLEMENTATION = "0x13f816511384D3534783241ddb5751c4b7a7e148"; // Original implementations

const Actions = {
  MINT: 0,
  BORROW: 2,
  ENTER_MARKETS: 7,
};

const vip98 = () => {
  const meta = {
    version: "v2",
    title: "VIP-98 Migrate to new TRX token",
    description: `VIP-98 Migrate to new TRX token`,
    forDescription: "I agree that Venus Protocol should migrate to the new TRX token",
    againstDescription: "I do not think that Venus Protocol should migrate to the new TRX token",
    abstainDescription: "I am indifferent to whether Venus Protocol migrates to the new TRX token",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_setActionsPaused(address[],uint8[],bool)",
        params: [[OLD_VTRX], [Actions.MINT, Actions.BORROW, Actions.ENTER_MARKETS], true],
      },
      {
        target: OLD_VTRX,
        signature: "_setImplementation(address,bool,bytes)",
        params: [VTRX_RESETTER, false, "0x"],
      },
      {
        target: OLD_VTRX,
        signature: "_setImplementation(address,bool,bytes)",
        params: [VTOKEN_IMPLEMENTATION, false, "0x"],
      },
      {
        target: OLD_VTRX,
        signature: "_setReserveFactor(uint256)",
        params: ["1000000000000000000"],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(25866574, () => {
  let comptroller: Comptroller;
  let vTrxOld: VBep20;
  let vTrxOldDelegator: VBep20Delegator;

  before(async () => {
    comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
    vTrxOld = await ethers.getContractAt("VBep20", OLD_VTRX);
    vTrxOldDelegator = await ethers.getContractAt("VBep20Delegator", OLD_VTRX);
  });

  testVip("VIP-98 Migrate to new TRX token", vip98());

  describe("Post-VIP behavior", async () => {
    it('sets TRXOLD name "Venus TRXOLD"', async () => {
      expect(await vTrxOld.name()).to.equal("Venus TRXOLD");
    });

    it('sets TRXOLD symbol "vTRXOLD"', async () => {
      expect(await vTrxOld.symbol()).to.equal("vTRXOLD");
    });

    it("restores TRXOLD implementation to the original one", async () => {
      const impl = await vTrxOldDelegator.implementation();
      expect(impl).to.equal(VTOKEN_IMPLEMENTATION);
    });

    it("pauses TRXOLD minting", async () => {
      const mintingPaused = await comptroller.actionPaused(OLD_VTRX, Actions.MINT);
      expect(mintingPaused).to.equal(true);
    });

    it("pauses TRXOLD borrowing", async () => {
      const mintingPaused = await comptroller.actionPaused(OLD_VTRX, Actions.BORROW);
      expect(mintingPaused).to.equal(true);
    });

    it("pauses entering TRXOLD market", async () => {
      const mintingPaused = await comptroller.actionPaused(OLD_VTRX, Actions.ENTER_MARKETS);
      expect(mintingPaused).to.equal(true);
    });

    it("sets TRXOLD reserve factor to 100%", async () => {
      const newReserveFactor = await vTrxOld.reserveFactorMantissa();
      expect(newReserveFactor).to.equal(parseUnits("1.0", 18));
    });
  });
});
