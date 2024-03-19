import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers } from "hardhat";

import { BEP20, Diamond, RewardFacet, SetterFacet } from "../../../typechain";
import { FacetCutAction, forking } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const OWNER = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const OLD_SETTER_FACET = "0xF2b7D75557B75a878E997934014E95Dd089B5f24";
const OLD_REWARD_FACET = "0x71e7AAcb01C5764A56DB92aa31aA473e839d964F";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const zeroAddr = "0x0000000000000000000000000000000000000000";

forking(34340887, () => {
  let diamond: Diamond;
  let owner: SignerWithAddress;

  if (process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet") {
    before(async () => {
      await impersonateAccount(OWNER);
      owner = await ethers.getSigner(OWNER);

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
        oldSetterFacet.connect(owner)._setXVSToken("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63"),
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
          action: FacetCutAction.Add,
          functionSelectors: [addXVSAddressFunctionSignature, addXVSVTokenAddressFunctionSignature],
        },
        {
          facetAddress: newSetterFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingSetterFacetFunctions,
        },
        {
          facetAddress: newRewardFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingRewardFacetFunctions,
        },
      ];

      await diamond.connect(owner).diamondCut(cut);

      const rewardFacet = await ethers.getContractAt("RewardFacet", diamond.address);
      const setterFacet = await ethers.getContractAt("SetterFacet", diamond.address);

      expect(await rewardFacet.getXVSVTokenAddress()).to.be.equal(zeroAddr);
      expect(await rewardFacet.getXVSAddress()).to.be.equal(zeroAddr);

      await setterFacet.connect(owner)._setXVSToken("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63");

      // Revert when setting address of another vtoken(for e.g. vAAVE) instead of XVSVToken
      await expect(
        setterFacet.connect(owner)._setXVSVToken("0x26DA28954763B92139ED49283625ceCAf52C6f94"),
      ).to.be.revertedWith("invalid xvs vtoken address");

      await setterFacet.connect(owner)._setXVSVToken("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D");

      expect(await rewardFacet.getXVSVTokenAddress()).to.be.equal("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D");
      expect(await rewardFacet.getXVSAddress()).to.be.equal("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63");

      const XVS: BEP20 = await ethers.getContractAt(
        "contracts/test/BEP20.sol:BEP20",
        "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
      );

      const userAccount = "0xd8F32fe3eeA457bBa2e5e2E1533Ad5f34f591458";
      const previouseXVSBalance = await XVS.balanceOf(userAccount);

      await rewardFacet["claimVenus(address)"](userAccount);
      const newXVSBalance = await XVS.balanceOf(userAccount);
      expect(newXVSBalance).to.be.gt(previouseXVSBalance);
    });
  }
});
