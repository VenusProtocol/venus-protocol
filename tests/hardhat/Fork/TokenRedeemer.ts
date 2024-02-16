import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FaucetToken, TokenRedeemer, TokenRedeemer__factory, VBep20 } from "../../../typechain";
import { deployComptrollerWithMarkets } from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, around, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const SUPPLIED_AMOUNT = parseUnits("5000", 18);

const addresses = {
  bscmainnet: {
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
    BUSD_HOLDER: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  },
};

const deployTokenRedeemer = async (owner: { address: string }): Promise<TokenRedeemer> => {
  const redeemerFactory: TokenRedeemer__factory = await ethers.getContractFactory("TokenRedeemer");
  const redeemer = await redeemerFactory.deploy(owner.address);
  await redeemer.deployed();
  return redeemer;
};

interface TokenRedeemerFixture {
  redeemer: TokenRedeemer;
  vToken: VBep20;
  underlying: FaucetToken;
  owner: SignerWithAddress;
  supplier: SignerWithAddress;
  treasuryAddress: string;
}

const setupLocal = async (): Promise<TokenRedeemerFixture> => {
  const [, owner, supplier, treasury] = await ethers.getSigners();
  const { comptroller, vTokens } = await deployComptrollerWithMarkets({ numBep20Tokens: 1 });
  const [vToken] = vTokens;

  const redeemer = await deployTokenRedeemer(owner);
  await comptroller._setMarketSupplyCaps([vToken.address], [ethers.constants.MaxUint256]);
  const underlying = await ethers.getContractAt("FaucetToken", await vToken.underlying());

  await underlying.allocateTo(supplier.address, SUPPLIED_AMOUNT);
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT);

  return { redeemer, supplier, vToken, underlying, owner, treasuryAddress: treasury.address };
};

const setupFork = async (): Promise<TokenRedeemerFixture> => {
  const comptroller = await ethers.getContractAt("ComptrollerMock", addresses.bscmainnet.COMPTROLLER);
  const vToken = await ethers.getContractAt("VBep20", addresses.bscmainnet.VBUSD);
  const underlying = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();

  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  const redeemer = await deployTokenRedeemer(timelock);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vToken.address], [ethers.constants.MaxUint256]);
  const actions = { MINT: 0 };
  await comptroller.connect(timelock)._setActionsPaused([vToken.address], [actions.MINT], false);

  const supplier = await initMainnetUser(addresses.bscmainnet.BUSD_HOLDER, parseEther("1"));
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT); // inject liquidity
  return { redeemer, supplier, vToken, underlying, owner: timelock, treasuryAddress };
};

const test = (setup: () => Promise<TokenRedeemerFixture>) => () => {
  describe("TokenRedeemer", () => {
    let redeemer: TokenRedeemer;
    let vToken: VBep20;
    let underlying: FaucetToken;
    let owner: SignerWithAddress;
    let supplier: SignerWithAddress;
    let someone: SignerWithAddress;
    let treasuryAddress: string;

    beforeEach(async () => {
      ({ redeemer, vToken, underlying, owner, supplier, treasuryAddress } = await loadFixture(setup));
      [someone] = await ethers.getSigners();
    });

    describe("redeemAndTransfer", () => {
      it("should fail if called by a non-owner", async () => {
        await expect(redeemer.connect(someone).redeemAndTransfer(vToken.address, treasuryAddress)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should fail if redeem fails", async () => {
        const failingVToken = await smock.fake<VBep20>("VBep20");
        failingVToken.redeem.returns(42);
        await expect(redeemer.connect(owner).redeemAndTransfer(failingVToken.address, treasuryAddress))
          .to.be.revertedWithCustomError(redeemer, "RedeemFailed")
          .withArgs(42);
      });

      it("should succeed with zero amount", async () => {
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasuryAddress);
        await expect(tx).to.emit(vToken, "Transfer").withArgs(redeemer.address, vToken.address, "0");
        await expect(tx).to.emit(underlying, "Transfer").withArgs(redeemer.address, treasuryAddress, "0");
      });

      it("should redeem all vTokens", async () => {
        const vTokenAmount = await vToken.balanceOf(supplier.address);
        const closeToSuppliedAmount = around(SUPPLIED_AMOUNT, parseUnits("0.1", 18));
        await vToken.connect(supplier).transfer(redeemer.address, vTokenAmount);
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasuryAddress);
        await expect(tx).to.emit(vToken, "Redeem").withArgs(redeemer.address, closeToSuppliedAmount, vTokenAmount, "0");
        await expect(tx).to.emit(vToken, "Transfer").withArgs(redeemer.address, vToken.address, vTokenAmount);
        await expect(tx)
          .to.emit(underlying, "Transfer")
          .withArgs(vToken.address, redeemer.address, closeToSuppliedAmount);
        expect(await vToken.balanceOf(redeemer.address)).to.equal(0);
      });

      it("should transfer all underlying to the receiver", async () => {
        const vTokenAmount = await vToken.balanceOf(supplier.address);
        const closeToSuppliedAmount = around(SUPPLIED_AMOUNT, parseUnits("0.1", 18));
        await vToken.connect(supplier).transfer(redeemer.address, vTokenAmount);
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasuryAddress);
        await expect(tx)
          .to.emit(underlying, "Transfer")
          .withArgs(redeemer.address, treasuryAddress, closeToSuppliedAmount);
        expect(await underlying.balanceOf(redeemer.address)).to.equal(0);
        expect(await underlying.balanceOf(treasuryAddress)).to.satisfy(closeToSuppliedAmount);
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 34699200;
  forking(blockNumber, test(setupFork));
} else {
  test(setupLocal)();
}
