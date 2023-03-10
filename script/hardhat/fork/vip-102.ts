import { expect } from "chai";
import { ethers } from "hardhat";

import { Comptroller } from "../../../typechain";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384";
const vBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";

const Actions = {
  BORROW: 2,
  ENTER_MARKETS: 7,
};

const vip102 = () => {
  const meta = {
    version: "v1",
    title: "VIP-102 Pause BUSD Market",
    description: `
    we'll follow Gauntlet recommendations related to BUSD. But, internally we consider these proposal too risky so we decided to start executing only the following actions:

    Pause borrows and entering the market in vBUSD
    Stop rewarding the market borrowers with XVS
    via Normal VIP
    
    Comptroller._setActionsPaused(...)
    `,
    forDescription: "I agree that Venus Protocol should proceed with the BUSD market pause",
    againstDescription: "I do not think that Venus Protocol should proceed with the BUSD market pause",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the BUSD market pause or not",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_setActionsPaused(address[],uint8[],bool)",
        params: [[vBUSD], [Actions.BORROW, Actions.ENTER_MARKETS], true],
      },
      {
        target: COMPTROLLER,
        signature: "_setVenusSpeeds(address[],uint256[],uint256[])",
        params: [[vBUSD], ["2712673611111111"], ["0"]],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26305917, () => {
  let comptroller: Comptroller;

  before(async () => {
    comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
  });

  describe("Pre-VIP behavior", async () => {
    it("BUSD borrowing", async () => {
      const borrowingPaused = await comptroller.actionPaused(vBUSD, Actions.BORROW);
      expect(borrowingPaused).to.equal(false);
    });

    it("entering BUSD market", async () => {
      const enteringPaused = await comptroller.actionPaused(vBUSD, Actions.ENTER_MARKETS);
      expect(enteringPaused).to.equal(false);
    });

    it("Venus Speeds", async () => {
      const borrowSpeed = await comptroller.venusBorrowSpeeds(vBUSD);
      const supplySpeed = await comptroller.venusSupplySpeeds(vBUSD);

      expect(borrowSpeed).not.equals(0);
      expect(supplySpeed).to.equal("2712673611111111");
    });
  });
});

forking(26305917, () => {
  testVip("VIP-102 Pause BUSD Market", vip102());
});

forking(26305917, () => {
  let comptroller: Comptroller;

  before(async () => {
    comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
    await pretendExecutingVip(vip102());
  });

  describe("Post-VIP behavior", async () => {
    it("pauses BUSD borrowing", async () => {
      const borrowingPaused = await comptroller.actionPaused(vBUSD, Actions.BORROW);
      expect(borrowingPaused).to.equal(true);
    });

    it("pauses entering BUSD market", async () => {
      const enteringPaused = await comptroller.actionPaused(vBUSD, Actions.ENTER_MARKETS);
      expect(enteringPaused).to.equal(true);
    });

    it("Venus Speeds", async () => {
      const borrowSpeed = await comptroller.venusBorrowSpeeds(vBUSD);
      const supplySpeed = await comptroller.venusSupplySpeeds(vBUSD);

      expect(borrowSpeed).to.equal(0);
      expect(supplySpeed).to.equal("2712673611111111");
    });
  });
});
