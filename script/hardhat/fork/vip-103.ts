import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384";
const NEW_VTRX = "0xC5D3466aA484B040eE977073fcF337f2c00071c1";
const OLD_VTRX = "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93";
const VSXP = "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0";
const VUSDC = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";

export const vip103 = () => {
  const meta = {
    version: "v2",
    title: "VIP-103 Gauntlet Rrecommendations",
    description: `
    TRXOLD. Conservative: Decrease CF to 0.30
    TRX. Aggressive:
      Increase CF to 0.40
      Increase Borrow Cap to 4,000,000
      Increase Supply Cap to 5,000,000
    SXP. Lower SXP’s collateral factor to 0.25
    USDC. Increase borrow cap to 124,700,000
    USDT. Increase borrow cap to 245,500,000

    `,
    forDescription: "I agree that Venus Protocol should proceed with the Gauntlet Rrecommendations",
    againstDescription: "I do not think that Venus Protocol should proceed with the Gauntlet Rrecommendations",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the Gauntlet Rrecommendations or not",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_setCollateralFactor(address,uint256)",
        params: [OLD_VTRX, parseUnits("0.3", 18)],
      },

      {
        target: COMPTROLLER,
        signature: "_setCollateralFactor(address,uint256)",
        params: [NEW_VTRX, parseUnits("0.4", 18)],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketBorrowCaps(address[],uint256[])",
        params: [
          [NEW_VTRX, VUSDC, VUSDT],
          ["4000000000000", "124700000000000000000000000", "245500000000000000000000000"],
        ],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketSupplyCaps(address[],uint256[])",
        params: [[NEW_VTRX], ["5000000000000"]],
      },
      {
        target: COMPTROLLER,
        signature: "_setCollateralFactor(address,uint256)",
        params: [VSXP, parseUnits("0.25", 18)],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26544741, () => {
  testVip("VIP-103 Gauntlet Rrecommendations", vip103());
});

forking(26544741, () => {
  let comptroller: any;

  before(async () => {
    comptroller = await ethers.getContractAt("ComptrollerInterface", COMPTROLLER);
    await pretendExecutingVip(vip103());
  });

  describe("Post-VIP behavior", async () => {
    it("Decrease TRX_OLD collateral factor to 30%", async () => {
      const market = await comptroller.markets(OLD_VTRX);
      expect(market.collateralFactorMantissa).to.equal(parseUnits("0.3", 18));
    });

    it("Increase NEW_VTRX collateral factor to 40%", async () => {
      const market = await comptroller.markets(NEW_VTRX);
      expect(market.collateralFactorMantissa).to.equal(parseUnits("0.4", 18));
    });

    it("Decrease SXP collateral factor to 25%", async () => {
      const market = await comptroller.markets(VSXP);
      expect(market.collateralFactorMantissa).to.equal(parseUnits("0.25", 18));
    });

    it("sets the borrow cap to 4,000,000 NEW_TRX", async () => {
      const newCap = await comptroller.borrowCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("4000000", 6));
    });

    it("sets the borrow cap to 124,700,000 USDC", async () => {
      const newCap = await comptroller.borrowCaps(VUSDC);
      expect(newCap).to.equal(parseUnits("124700000", 18));
    });

    it("sets the borrow cap to 245,500,000 USDT", async () => {
      const newCap = await comptroller.borrowCaps(VUSDT);
      expect(newCap).to.equal(parseUnits("245500000", 18));
    });

    it("sets the supply cap to 5,000,000 NEW_TRX", async () => {
      const newCap = await comptroller.supplyCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("5000000", 6));
    });
  });
});
