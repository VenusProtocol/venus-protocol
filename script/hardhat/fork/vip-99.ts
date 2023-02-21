import { expect } from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { Comptroller, IERC20Upgradeable, PriceOracle, VBep20 } from "../../../typechain";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { initMainnetUser, makeProposal } from "./vip-framework/utils";

const COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384";
const NEW_VTRX = "0xC5D3466aA484B040eE977073fcF337f2c00071c1";
const OLD_VTRX = "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93";
const NEW_TRX = "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3";
const TRX_HOLDER = "0xCa266910d92a313E5F9eb1AfFC462bcbb7d9c4A9";
const TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const INITIAL_FUNDING = "1000000000";
const INITIAL_VTOKENS = "100000000000";

const vip99 = () => {
  const meta = {
    version: "v2",
    title: "VIP-99 Migrate to new TRX token",
    description: `VIP-99 Migrate to new TRX token`,
    forDescription: "I agree that Venus Protocol should migrate to the new TRX token",
    againstDescription: "I do not think that Venus Protocol should migrate to the new TRX token",
    abstainDescription: "I am indifferent to whether Venus Protocol migrates to the new TRX token",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_supportMarket(address)",
        params: [NEW_VTRX],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketSupplyCaps(address[],uint256[])",
        params: [[NEW_VTRX], ["180000000000"]],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketBorrowCaps(address[],uint256[])",
        params: [[NEW_VTRX], ["100000000000"]],
      },
      {
        target: COMPTROLLER,
        signature: "_setVenusSpeeds(address[],uint256[],uint256[])",
        params: [
          [OLD_VTRX, NEW_VTRX],
          ["0", "217013888888889"],
          ["0", "217013888888889"],
        ],
      },
      {
        target: NEW_TRX,
        signature: "approve(address,uint256)",
        params: [NEW_VTRX, 0],
      },
      {
        target: NEW_TRX,
        signature: "approve(address,uint256)",
        params: [NEW_VTRX, INITIAL_FUNDING],
      },
      {
        target: NEW_VTRX,
        signature: "mint(uint256)",
        params: [INITIAL_FUNDING],
      },
      {
        target: NEW_VTRX,
        signature: "transfer(address,uint256)",
        params: [TRX_HOLDER, INITIAL_VTOKENS],
      },
      {
        target: NEW_VTRX,
        signature: "_acceptAdmin()",
        params: [],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

const fundGovernance = async () => {
  const trx = await ethers.getContractAt("IERC20Upgradeable", NEW_TRX);
  const trxHolder = await initMainnetUser(TRX_HOLDER, parseEther("1"));
  trx.connect(trxHolder).transfer(TIMELOCK, INITIAL_FUNDING);
};

forking(25868050, () => {
  before(async () => {
    await fundGovernance();
  });

  testVip("VIP-99 Migrate to new TRX token", vip99());
});

forking(25868050, () => {
  let comptroller: Comptroller;
  let trx: IERC20Upgradeable;
  let vTrx: VBep20;
  let oracle: PriceOracle;

  before(async () => {
    comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
    const oracleAddress = await comptroller.oracle();
    oracle = await ethers.getContractAt("PriceOracle", oracleAddress);
    trx = await ethers.getContractAt("IERC20Upgradeable", NEW_TRX);
    vTrx = await ethers.getContractAt("VBep20", NEW_VTRX);

    await fundGovernance();
    await pretendExecutingVip(vip99());
  });

  describe("Post-VIP behavior", async () => {
    it("adds a new TRX market", async () => {
      const market = await comptroller.markets(NEW_VTRX);
      expect(market.isListed).to.equal(true);
      expect(market.collateralFactorMantissa).to.equal(0);
    });

    it("sets the supply cap to 180,000 TRX", async () => {
      const newCap = await comptroller.supplyCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("180000", 6));
    });

    it("sets the borrow cap to 100,000 TRX", async () => {
      const newCap = await comptroller.borrowCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("100000", 6));
    });

    it("does not leave TRX on the balance of the governance", async () => {
      const timelockBalance = await trx.balanceOf(TIMELOCK);
      expect(timelockBalance).to.equal(0);
    });

    it("does not leave vTRX on the balance of the governance", async () => {
      const timelockBalance = await vTrx.balanceOf(TIMELOCK);
      expect(timelockBalance).to.equal(0);
    });

    it("moves 1 vTRX to the community wallet", async () => {
      const communityBalance = await vTrx.balanceOf(TRX_HOLDER);
      expect(communityBalance).to.equal(parseUnits("1000", 8));
    });

    it("has the correct oracle price", async () => {
      const price = await oracle.getUnderlyingPrice(NEW_VTRX);
      expect(price).to.equal(parseUnits("0.0700138", 30));
    });

    it("sets the admin to governance", async () => {
      expect(await vTrx.admin()).to.equal(TIMELOCK);
    });
  });
});
