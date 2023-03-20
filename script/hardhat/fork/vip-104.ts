import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

import BNBRedeemerAbi from "./abi/bnbRedeemerAbi.json";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { initMainnetUser, makeProposal } from "./vip-framework/utils";

// Wallets
const BNB_CHAIN_WALLET = "0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D"; // (TBD)
const BNB_EXPLOITER = "0x489A8756C18C0b8B24EC2a2b9FF3D4d447F79BEc";

// Custom contracts
const ALLOW_SEIZE_COMPTROLLER_IMPL = "0xbD6028B411F8A891B2A3ccF3fD5857e90570fB0a";
const REDEEMER_CONTRACT = "0x7FfeA9123340Fe42d4338BBa43A62904E6948D21";

// Venus contracts
const TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const COMPTROLLER_IMPL = "0x909dd16b24CEf96c7be13065a9a0EAF8A126FFa5";

const BNB_EXPLOITER_VTOKEN_BALANCE = "4128299506283892";

const vip104 = () => {
  const meta = {
    version: "v2",
    title: "VIP-104 Transfer BNB collateral",
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
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26627080, () => {
  let vBNB: ethers.Contract;

  before(async () => {
    vBNB = await ethers.getContractAt("VBNB", VBNB);
  });

  testVip("VIP-104", vip104());

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

      it("fails if BNB market has insufficient liquidity", async () => {
        // We don't have enough liquidity to redeem all the vBNB at block #26627080
        await expect(redeemerContract.connect(owner).redeemAll()).to.be.reverted;
      });

      it("should redeem the remaining BNB", async () => {
        // Pretend someone deposited 1M BNB
        const comptroller = await ethers.getContractAt("Comptroller", COMPTROLLER);
        const timelock = await initMainnetUser(TIMELOCK, parseEther("1"));
        await comptroller.connect(timelock)._setMarketSupplyCaps([VBNB], [parseEther("10000000")]);
        await setBalance(someone.address, parseEther("1000001")); // plus 1 BNB to pay for gas
        await vBNB.connect(someone).mint({ value: parseEther("1000000") });

        await redeemerContract.connect(owner).redeemAll();

        const bnbBalance = await ethers.provider.getBalance(REDEEMER_CONTRACT);
        // Current value + 10 BNB from the previous test + interest
        const expectedBalance = parseEther("921400.086223467599869442");
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
        expect(bnbBalance).to.equal(parseEther("921400.086223467599869442"));
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
