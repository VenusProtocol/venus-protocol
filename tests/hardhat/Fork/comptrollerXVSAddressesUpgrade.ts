import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, network } from "hardhat";

import { BEP20, Diamond, RewardFacet, SetterFacet } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const OLD_SETTER_FACET = "0xF2b7D75557B75a878E997934014E95Dd089B5f24";
const OLD_REWARD_FACET = "0x71e7AAcb01C5764A56DB92aa31aA473e839d964F";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const zeroAddr = "0x0000000000000000000000000000000000000000";

export async function setForkBlock(blockNumber: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK}`],
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

const forking = (blockNumber: number, fn: () => void) => {
  describe(`Reward and Setter facet upgrade check At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

forking(34340887, () => {
  let diamond: Diamond;
  let owner: SignerWithAddress;

  if (process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet") {
    before(async () => {
      await impersonateAccount(Owner);
      owner = await ethers.getSigner(Owner);

      diamond = await ethers.getContractAt("Diamond", UNITROLLER);
    });

    it("pre checks", async () => {
      const rewardFacet = await ethers.getContractAt("RewardFacet", diamond.address);

      expect(await rewardFacet.getXVSVTokenAddress()).to.be.equal("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D");
      expect(await rewardFacet.getXVSAddress()).to.be.equal("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63");
    });

    it("upgrade checks", async () => {
      const oldSetterFacet = await ethers.getContractAt("SetterFacet", diamond.address);
      await expect(
        oldSetterFacet.connect(owner)._setXVSToken("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D"),
      ).to.be.revertedWith("Diamond: Function does not exist");
      await expect(
        oldSetterFacet.connect(owner)._setXVSVToken("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D"),
      ).to.be.revertedWith("Diamond: Function does not exist");

      const setterFacetFactory = await ethers.getContractFactory("SetterFacet");
      const newSetterFacet: SetterFacet = await setterFacetFactory.deploy();
      await newSetterFacet.deployed();

      const addXVSAddressFunctionSignature = newSetterFacet.interface.getSighash(
        newSetterFacet.interface.functions["_setXVSToken(address)"],
      );
      const addXVSVTokenAddressFunctionSignature = newSetterFacet.interface.getSighash(
        newSetterFacet.interface.functions["_setXVSVToken(address)"],
      );

      const rewardFacetFactory = await ethers.getContractFactory("RewardFacet");
      const newRewardFacet: RewardFacet = await rewardFacetFactory.deploy();
      await newRewardFacet.deployed();

      const existingSetterFacetFunctions = await diamond.facetFunctionSelectors(OLD_SETTER_FACET);
      const existingRewardFacetFunctions = await diamond.facetFunctionSelectors(OLD_REWARD_FACET);

      const cut = [
        {
          facetAddress: newSetterFacet.address,
          action: 0,
          functionSelectors: [addXVSAddressFunctionSignature, addXVSVTokenAddressFunctionSignature],
        },
        {
          facetAddress: newSetterFacet.address,
          action: 1,
          functionSelectors: existingSetterFacetFunctions,
        },
        {
          facetAddress: newRewardFacet.address,
          action: 1,
          functionSelectors: existingRewardFacetFunctions,
        },
      ];

      await diamond.connect(owner).diamondCut(cut);

      const rewardFacet = await ethers.getContractAt("RewardFacet", diamond.address);
      const setterFacet = await ethers.getContractAt("SetterFacet", diamond.address);

      expect(await rewardFacet.getXVSVTokenAddress()).to.be.equal(zeroAddr);
      expect(await rewardFacet.getXVSAddress()).to.be.equal(zeroAddr);

      await setterFacet.connect(owner)._setXVSToken("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63");
      await setterFacet.connect(owner)._setXVSVToken("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D");

      expect(await rewardFacet.getXVSVTokenAddress()).to.be.equal("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D");
      expect(await rewardFacet.getXVSAddress()).to.be.equal("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63");

      const XVS: BEP20 = await ethers.getContractAt(
        "contracts/test/BEP20.sol:BEP20",
        "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
      );

      const userAccount = "0xd8F32fe3eeA457bBa2e5e2E1533Ad5f34f591458";
      const previouseXVSBalance = await XVS.balanceOf(userAccount);
      console.log();

      await rewardFacet["claimVenus(address)"](userAccount);
      const newXVSBalance = await XVS.balanceOf(userAccount);
      expect(newXVSBalance).to.be.gt(previouseXVSBalance);
    });
  }
});
