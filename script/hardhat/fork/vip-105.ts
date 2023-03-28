import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { initMainnetUser, makeProposal } from "./vip-framework/utils";

// Wallets
const BNB_CHAIN_WALLET = "0xe0Bf68Ae48C5748f380BB732b7B1ce7776B63A71"; // (TBD)
const BNB_EXPLOITER = "0x489A8756C18C0b8B24EC2a2b9FF3D4d447F79BEc";

// Custom contracts
const ALLOW_SEIZE_COMPTROLLER_IMPL = "0x3e5f527adf40b65fcbb4918e6507ecb89af7cdf5";

// Venus contracts
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const VXVS = "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D";
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const COMPTROLLER_IMPL = "0x909dd16b24CEf96c7be13065a9a0EAF8A126FFa5";

const BNB_EXPLOITER_VTOKEN_BALANCE = "4128299506283892";

const vip105 = () => {
  const meta = {
    version: "v2",
    title: "VIP-105 Transfer BNB collateral",
    description: ``,
    forDescription: "I agree that Venus Protocol should proceed with this proposal",
    againstDescription: "I do not think that Venus Protocol should proceed with this proposal",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds or not",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_setPendingImplementation(address)",
        params: [ALLOW_SEIZE_COMPTROLLER_IMPL],
      },

      {
        target: ALLOW_SEIZE_COMPTROLLER_IMPL,
        signature: "_become(address)",
        params: [COMPTROLLER],
      },

      {
        target: VBNB,
        signature: "seize(address,address,uint256)",
        params: [BNB_CHAIN_WALLET, BNB_EXPLOITER, BNB_EXPLOITER_VTOKEN_BALANCE],
      },

      {
        target: COMPTROLLER,
        signature: "_setPendingImplementation(address)",
        params: [COMPTROLLER_IMPL],
      },

      {
        target: COMPTROLLER_IMPL,
        signature: "_become(address)",
        params: [COMPTROLLER],
      },

      {
        target: COMPTROLLER,
        signature: "claimVenusAsCollateral(address)",
        params: [BNB_EXPLOITER],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26852614, () => {
  describe("Pre-VIP state", async () => {
    it("should have 0 vXVS balance", async () => {
      const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
      const vXVS = await ethers.getContractAt("VToken", VXVS);
      const vXVSBalance = await vXVS.balanceOf(BNB_EXPLOITER);
      expect(vXVSBalance).to.equal("0");
      expect(await comptroller.venusAccrued(BNB_EXPLOITER)).to.equal(parseUnits("39512.833719502606056893", 18));
    });

    it("should have the exploiter balance of vBNB", async () => {
      const vBNB = await ethers.getContractAt("VBNB", VBNB);
      const balance = await vBNB.balanceOf(BNB_EXPLOITER);
      expect(balance).to.equal(BNB_EXPLOITER_VTOKEN_BALANCE);
    });
  });

  testVip("VIP-105", vip105());
});

forking(26852614, () => {
  let vBNB: ethers.Contract;
  let previousVBNBChainWalletBalance: BigNumber;

  before(async () => {
    vBNB = await ethers.getContractAt("VBNB", VBNB);
    previousVBNBChainWalletBalance = await vBNB.balanceOf(BNB_CHAIN_WALLET);
    await pretendExecutingVip(vip105());
  });

  describe("Post-VIP state", async () => {
    it("should seize the exploiter's vBNB", async () => {
      const balance = await vBNB.balanceOf(BNB_EXPLOITER);
      expect(balance).to.equal("0");
    });

    it("should transfer the seized vBNB to the BNB chain wallet", async () => {
      const balance = await vBNB.balanceOf(BNB_CHAIN_WALLET);
      expect(balance.sub(previousVBNBChainWalletBalance)).to.equal(BNB_EXPLOITER_VTOKEN_BALANCE);
    });

    it("should restore the original Comptroller implementation", async () => {
      const comptroller = await ethers.getContractAt("Unitroller", COMPTROLLER);
      const implementation = await comptroller.comptrollerImplementation();
      expect(implementation).to.equal(COMPTROLLER_IMPL);
    });

    it("should claim XVS as collateral", async () => {
      const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
      const vXVS = await ethers.getContractAt("VToken", VXVS);
      const vXVSBalance = await vXVS.balanceOf(BNB_EXPLOITER);
      expect(vXVSBalance).to.equal(parseUnits("4291124.04163015", 8));
      expect(await comptroller.venusAccrued(BNB_EXPLOITER)).to.equal("0");
    });
  });

  describe("Redeemer BNB chain wallet", async () => {
    let bnbChainWallet : SignerWithAddress;

    before(async () => {
      bnbChainWallet = await initMainnetUser(BNB_CHAIN_WALLET, parseEther("1"));
    });

    describe("redeemUnderlying", async () => {
      it("should redeem 10 BNB", async () => {
        const bnbToRedeem = parseEther("10");
        await expect(() => vBNB.connect(bnbChainWallet).redeemUnderlying(bnbToRedeem)).to.changeEtherBalance(
          bnbChainWallet,
          bnbToRedeem,
        );
      });

      it("should redeem the remaining BNB", async () => {
        const bnbToGet = parseUnits("914442.908872527589735638", 18)
        const vBNBChainWalletBalance = await vBNB.balanceOf(BNB_CHAIN_WALLET);
        await expect(() => vBNB.connect(bnbChainWallet).redeem(vBNBChainWalletBalance)).to.changeEtherBalance(
          bnbChainWallet,
          bnbToGet,
        );
      });
    });
  });
});
