import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { JumpRateModel } from "../../../typechain";
import { forking, testVip } from "./vip-framework";
import { Command, ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const VUSDC = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const VBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const VCAKE = "0x86aC3974e2BD0d60825230fa6F355fF11409df5c";
const VTUSD = "0x08CEB3F4a7ed3500cA0982bcd0FC7816688084c3";
const VDAI = "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1";

const STABLECOINS_RATE_MODEL = "0x8612b1330575d3f2f792329C5c16d55f22433c3F";
const BNB_RATE_MODEL = "0x1B047f9717154EA5EC59674273d50a137212cBb4";
const CAKE_RATE_MODEL = "0x86BB8a8D3223AB43A9eCB4d127B509589d73DA48";

const vip102 = () => {
  const meta = {
    version: "v2",
    title: "VIP-102 Interest Rate Model Parameter Updates",
    description: `#### Summary

- Raise the jump multiplier for USDC, TUSD, DAI, BUSD and USDT (all stablecoins).
- Lower the kink, raise the multiplier and jump multiplier, and raise the reserve factor for BNB.
- Lower the kink and raise the multiplier for CAKE.


#### Reasoning

Gauntlet has identified these opportunities to adjust the IR Curves to mitigate protocol risk while building protocol revenue via reserves.

Many interest rate curves on Venus have not been updated recently. Given the significant shifts in crypto markets, Gauntlet has evaluated assets on Venus and has identified opportunities to adjust parameters for certain assets to benefit the protocol.

Using data to model interest rate behavior is a complex task given that user elasticity is likely not constant and behavior will be influenced by general market sentiment (bear and bull markets) and headline-grabbing events.

Nonetheless, Gauntlet introduces frameworks for making data-informed decisions on setting borrower and supplier interest rates. These frameworks apply for when market conditions require the protocol to reduce risk or when strategic opportunities present themselves to increase protocol revenue without materially impacting risk.

#### Proposed Upgrade

Please, see the complete details of this proposal in [this article](https://community.venus.io/t/interest-rate-model-parameter-updates-2023-03-01/3365) previously published on the Venus Community Forum by Gauntlet.
`,
    forDescription: "I agree that Venus Protocol should proceed with this proposal",
    againstDescription: "I do not think that Venus Protocol should proceed with this proposal",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds or not",
  };

  return makeProposal(
    [
      ...[VUSDC, VUSDT, VBUSD, VTUSD, VDAI].map((vToken: string): Command => {
        return {
          target: vToken,
          signature: "_setInterestRateModel(address)",
          params: [STABLECOINS_RATE_MODEL],
        };
      }),

      {
        target: VBNB,
        signature: "_setInterestRateModel(address)",
        params: [BNB_RATE_MODEL],
      },

      {
        target: VCAKE,
        signature: "_setInterestRateModel(address)",
        params: [CAKE_RATE_MODEL],
      },

      {
        target: VBNB,
        signature: "_setReserveFactor(uint256)",
        params: ["250000000000000000"],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26341200, () => {
  describe("Interest rate models sanity check", async () => {
    let rateModel: JumpRateModel;

    const toBlockRate = (ratePerYear: BigNumber): BigNumber => {
      const BLOCKS_PER_YEAR = BigNumber.from("10512000");
      return ratePerYear.div(BLOCKS_PER_YEAR);
    };

    describe("Stablecoin rate model", async () => {
      before(async () => {
        rateModel = await ethers.getContractAt("JumpRateModel", STABLECOINS_RATE_MODEL);
      });

      it("has base=0", async () => {
        expect(await rateModel.baseRatePerBlock()).to.equal(toBlockRate(parseUnits("0", 18)));
      });

      it("has kink=80%", async () => {
        expect(await rateModel.kink()).to.equal(parseUnits("0.8", 18));
      });

      it("has multiplier=5%", async () => {
        expect(await rateModel.multiplierPerBlock()).to.equal(toBlockRate(parseUnits("0.05", 18)));
      });

      it("has jumpMultiplier=250%", async () => {
        expect(await rateModel.jumpMultiplierPerBlock()).to.equal(toBlockRate(parseUnits("2.5", 18)));
      });
    });

    describe("BNB rate model", async () => {
      before(async () => {
        rateModel = await ethers.getContractAt("JumpRateModel", BNB_RATE_MODEL);
      });

      it("has base=0", async () => {
        expect(await rateModel.baseRatePerBlock()).to.equal(toBlockRate(parseUnits("0", 18)));
      });

      it("has kink=60%", async () => {
        expect(await rateModel.kink()).to.equal(parseUnits("0.6", 18));
      });

      it("has multiplier=15%", async () => {
        expect(await rateModel.multiplierPerBlock()).to.equal(toBlockRate(parseUnits("0.15", 18)));
      });

      it("has jumpMultiplier=300%", async () => {
        expect(await rateModel.jumpMultiplierPerBlock()).to.equal(toBlockRate(parseUnits("3.0", 18)));
      });
    });

    describe("Cake rate model", async () => {
      before(async () => {
        rateModel = await ethers.getContractAt("JumpRateModel", CAKE_RATE_MODEL);
      });

      it("has base=2%", async () => {
        expect(await rateModel.baseRatePerBlock()).to.equal(toBlockRate(parseUnits("0.02", 18)));
      });

      it("has kink=50%", async () => {
        expect(await rateModel.kink()).to.equal(parseUnits("0.5", 18));
      });

      it("has multiplier=20%", async () => {
        expect(await rateModel.multiplierPerBlock()).to.equal(toBlockRate(parseUnits("0.2", 18)));
      });

      it("has jumpMultiplier=300%", async () => {
        expect(await rateModel.jumpMultiplierPerBlock()).to.equal(toBlockRate(parseUnits("3.0", 18)));
      });
    });
  });

  testVip("VIP-102", vip102());

  describe("Post-VIP checks", async () => {
    it("sets interest rate model for vUSDC", async () => {
      const vToken = await ethers.getContractAt("VToken", VUSDC);
      expect(await vToken.interestRateModel()).to.equal(STABLECOINS_RATE_MODEL);
    });

    it("sets interest rate model for vUSDT", async () => {
      const vToken = await ethers.getContractAt("VToken", VUSDT);
      expect(await vToken.interestRateModel()).to.equal(STABLECOINS_RATE_MODEL);
    });

    it("sets interest rate model for vBUSD", async () => {
      const vToken = await ethers.getContractAt("VToken", VBUSD);
      expect(await vToken.interestRateModel()).to.equal(STABLECOINS_RATE_MODEL);
    });

    it("sets interest rate model for vTUSD", async () => {
      const vToken = await ethers.getContractAt("VToken", VTUSD);
      expect(await vToken.interestRateModel()).to.equal(STABLECOINS_RATE_MODEL);
    });

    it("sets interest rate model for vDAI", async () => {
      const vToken = await ethers.getContractAt("VToken", VDAI);
      expect(await vToken.interestRateModel()).to.equal(STABLECOINS_RATE_MODEL);
    });

    it("sets interest rate model for vBNB", async () => {
      const vToken = await ethers.getContractAt("VToken", VBNB);
      expect(await vToken.interestRateModel()).to.equal(BNB_RATE_MODEL);
    });

    it("sets interest rate model for vCAKE", async () => {
      const vToken = await ethers.getContractAt("VToken", VCAKE);
      expect(await vToken.interestRateModel()).to.equal(CAKE_RATE_MODEL);
    });

    it("sets reserve factor to 25% for vBNB", async () => {
      const vToken = await ethers.getContractAt("VToken", VBNB);
      expect(await vToken.reserveFactorMantissa()).to.equal(parseUnits("0.25", 18));
    });
  });
});
