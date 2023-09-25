import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { ComptrollerInterface } from "../../../typechain";
import COMPTROLLER_ABI from "./vip-104/comptroller.json";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { expectEvents, makeProposal, setMaxStalePeriodInOracle } from "./vip-framework/utils";

const COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384";
const NEW_VTRX = "0xC5D3466aA484B040eE977073fcF337f2c00071c1";
const OLD_VTRX = "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93";
const VDAI = "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1";
const VSXP = "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0";

export const vip104 = () => {
  const meta = {
    version: "v2",
    title: "VIP-104 Gauntlet Recommendations",
    description: `
    TRXOLD: Decrease CF to 0.20 (conservative)
    SXP: lower collateral factor to 17.5%
    TRX: (aggressive)
    * Increase CF to 0.45
    * Increase Borrow Cap to 8,000,000
    * Increase Supply Cap to 10,000,000
    DAI: Increase borrow cap to 7,500,000 (from 7 millions)
    `,
    forDescription: "I agree that Venus Protocol should proceed with the Gauntlet's Recommendations",
    againstDescription: "I do not think that Venus Protocol should proceed with the Gauntlet's Recommendations",
    abstainDescription:
      "I am indifferent to whether Venus Protocol proceeds with the Gauntlet's Recommendations or not",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_setCollateralFactor(address,uint256)",
        params: [OLD_VTRX, parseUnits("0.2", 18)],
      },

      {
        target: COMPTROLLER,
        signature: "_setCollateralFactor(address,uint256)",
        params: [NEW_VTRX, parseUnits("0.45", 18)],
      },

      {
        target: COMPTROLLER,
        signature: "_setMarketBorrowCaps(address[],uint256[])",
        params: [
          [NEW_VTRX, VDAI],
          ["8000000000000", parseUnits("7500000", 18)],
        ],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketSupplyCaps(address[],uint256[])",
        params: [[NEW_VTRX], ["10000000000000"]],
      },

      {
        target: COMPTROLLER,
        signature: "_setCollateralFactor(address,uint256)",
        params: [VSXP, parseUnits("0.175", 18)],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26881099, () => {
  let comptroller: ComptrollerInterface;

  before(async () => {
    comptroller = await ethers.getContractAt("ComptrollerInterface", COMPTROLLER);
  });

  describe("Pre-VIP behavior", async () => {
    it("collateral factor of SXP  equals 30%", async () => {
      const newCollateralFactor = (await comptroller.markets(VSXP)).collateralFactorMantissa;
      expect(newCollateralFactor).to.equal(parseUnits("0.25", 18));
    });

    it("collateral factor of TRX (old) equals 30%", async () => {
      const newCollateralFactor = (await comptroller.markets(OLD_VTRX)).collateralFactorMantissa;
      expect(newCollateralFactor).to.equal(parseUnits("0.3", 18));
    });

    it("collateral factor of TRX (new) equals 40%", async () => {
      const newCollateralFactor = (await comptroller.markets(NEW_VTRX)).collateralFactorMantissa;
      expect(newCollateralFactor).to.equal(parseUnits("0.4", 18));
    });

    it("supply cap of TRX (new) equals 5000000", async () => {
      const oldCap = await comptroller.supplyCaps(NEW_VTRX);
      expect(oldCap).to.equal(parseUnits("5000000", 6));
    });

    it("borrow cap of TRX (new) equals 4000000", async () => {
      const oldCap = await comptroller.borrowCaps(NEW_VTRX);
      expect(oldCap).to.equal(parseUnits("4000000", 6));
    });

    it("borrow cap of DAI equals 7041000", async () => {
      const oldCap = await comptroller.borrowCaps(VDAI);
      expect(oldCap).to.equal(parseUnits("7041000", 18));
    });
  });
});

forking(26881099, () => {
  before(async () => {
    await setMaxStalePeriodInOracle(COMPTROLLER);
  });

  testVip("VIP-104 Risk Parameters Update", vip104(), {
    callbackAfterExecution: async txResponse => {
      await expectEvents(
        txResponse,
        [COMPTROLLER_ABI],
        ["NewCollateralFactor", "NewBorrowCap", "NewSupplyCap", "Failure"],
        [3, 2, 1, 0],
      );
    },
  });
});

forking(26881099, () => {
  let comptroller: ComptrollerInterface;

  before(async () => {
    comptroller = await ethers.getContractAt("ComptrollerInterface", COMPTROLLER);
    await pretendExecutingVip(vip104());
  });

  describe("Post-VIP behavior", async () => {
    it("collateral factor of TRX (old) equals 20%", async () => {
      const newCollateralFactor = (await comptroller.markets(OLD_VTRX)).collateralFactorMantissa;
      expect(newCollateralFactor).to.equal(parseUnits("0.2", 18));
    });

    it("collateral factor of TRX (new) equals 45%", async () => {
      const newCollateralFactor = (await comptroller.markets(NEW_VTRX)).collateralFactorMantissa;
      expect(newCollateralFactor).to.equal(parseUnits("0.45", 18));
    });

    it("supply cap of TRX (new) equals 10000000", async () => {
      const newCap = await comptroller.supplyCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("10000000", 6));
    });

    it("borrow cap of TRX (new) equals 8000000", async () => {
      const newCap = await comptroller.borrowCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("8000000", 6));
    });

    it("borrow cap of DAI equals 7500000", async () => {
      const newCap = await comptroller.borrowCaps(VDAI);
      expect(newCap).to.equal(parseUnits("7500000", 18));
    });

    it("collateral factor of SXP  equals 17.5%", async () => {
      const newCollateralFactor = (await comptroller.markets(VSXP)).collateralFactorMantissa;
      expect(newCollateralFactor).to.equal(parseUnits("0.175", 18));
    });
  });
});
