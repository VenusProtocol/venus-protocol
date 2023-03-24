import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import BNBRedeemerAbi from "./abi/bnbRedeemerAbi.json";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { initMainnetUser, makeProposal } from "./vip-framework/utils";

// Wallets
const BNB_CHAIN_WALLET = "0xa05f990d647287e4E84715b813BC000aEA970467"; // (TBD)
const BNB_EXPLOITER = "0x489A8756C18C0b8B24EC2a2b9FF3D4d447F79BEc";

// Custom contracts
const ALLOW_SEIZE_COMPTROLLER_IMPL = "0xbD6028B411F8A891B2A3ccF3fD5857e90570fB0a";
const REDEEMER_CONTRACT = "0x7FfeA9123340Fe42d4338BBa43A62904E6948D21";

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
        params: [REDEEMER_CONTRACT, BNB_EXPLOITER, BNB_EXPLOITER_VTOKEN_BALANCE],
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

forking(26741786, () => {
  describe("Pre-VIP state", async () => {
    it("should have 0 vXVS balance", async () => {
      const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
      const vXVS = await ethers.getContractAt("VToken", VXVS);
      const vXVSBalance = await vXVS.balanceOf(BNB_EXPLOITER);
      expect(vXVSBalance).to.equal("0");
      expect(await comptroller.venusAccrued(BNB_EXPLOITER)).to.equal(parseUnits("39512.833719502606056893", 18));
    });
  });

  testVip("VIP-105", vip105());
});

forking(26741786, () => {
  let vBNB: ethers.Contract;

  before(async () => {
    vBNB = await ethers.getContractAt("VBNB", VBNB);
    await pretendExecutingVip(vip105());
  });

  describe("Post-VIP state", async () => {
    it("should seize the exploiter's vBNB", async () => {
      const balance = await vBNB.balanceOf(BNB_EXPLOITER);
      expect(balance).to.equal("0");
    });

    it("should transfer the seized vBNB to the seizer contract address", async () => {
      const balance = await vBNB.balanceOf(REDEEMER_CONTRACT);
      expect(balance).to.equal(BNB_EXPLOITER_VTOKEN_BALANCE);
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
      expect(vXVSBalance).to.equal(parseUnits("4246232.65731299", 8));
      expect(await comptroller.venusAccrued(BNB_EXPLOITER)).to.equal("0");
    });
  });

  describe("Redeemer contract", async () => {
    let redeemerContract: ethers.Contract;
    let owner: SignerWithAddress;
    let someone: SignerWithAddress;

    before(async () => {
      redeemerContract = await ethers.getContractAt(BNBRedeemerAbi, REDEEMER_CONTRACT);
      [, someone] = await ethers.getSigners();
      owner = await initMainnetUser(BNB_CHAIN_WALLET, parseEther("1"));
    });

    describe("redeemUnderlying", async () => {
      it("fails if called by a non-owner", async () => {
        await expect(redeemerContract.connect(someone).redeemUnderlying(parseEther("10"))).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should redeem 10 BNB", async () => {
        await redeemerContract.connect(owner).redeemUnderlying(parseEther("10"));

        const bnbBalance = await ethers.provider.getBalance(REDEEMER_CONTRACT);
        expect(bnbBalance).to.eq(parseEther("10"));
      });
    });

    describe("redeemAll", async () => {
      it("fails if called by a non-owner", async () => {
        await expect(redeemerContract.connect(someone).redeemAll()).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should redeem the remaining BNB", async () => {
        await redeemerContract.connect(owner).redeemAll();

        const bnbBalance = await ethers.provider.getBalance(REDEEMER_CONTRACT);
        // Current value + 10 BNB from the previous test + interest
        const expectedBalance = parseEther("914439.677598755492870728");
        expect(bnbBalance).to.equal(expectedBalance);

        expect(await vBNB.balanceOf(REDEEMER_CONTRACT)).to.equal("0");
      });
    });

    describe("withdrawBNB", async () => {
      it("fails if called by a non-owner", async () => {
        await expect(redeemerContract.connect(someone).redeemAll()).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("transfers BNB to the owner", async () => {
        const bnbBalance = await ethers.provider.getBalance(REDEEMER_CONTRACT);
        expect(bnbBalance).to.equal(parseEther("914439.677598755492870728"));
        await expect(() => redeemerContract.connect(owner).withdrawBNB()).to.changeEtherBalances(
          [redeemerContract, owner],
          [BigNumber.from(0).sub(bnbBalance), bnbBalance],
        );

        const newBalance = await ethers.provider.getBalance(REDEEMER_CONTRACT);
        expect(newBalance).to.equal("0");
      });
    });
  });
});
