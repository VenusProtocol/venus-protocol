import { smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber } from "ethers";
import { Interface, parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  FaucetToken,
  TokenRedeemer,
  TokenRedeemer__factory,
  VAI,
  VAIController,
  VBNB,
  VBep20,
} from "../../../typechain";
import { deployComptrollerWithMarkets } from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, around, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const SUPPLIED_AMOUNT = parseUnits("3000", 18);
const BORROWED_AMOUNT = parseUnits("1000", 18);

const addresses = {
  bscmainnet: {
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VUSDC: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8",
    VUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
    USDC_HOLDERS: [
      "0xe2fc31F816A9b94326492132018C3aEcC4a93aE1",
      "0x3Dd878A95DCAEF2800cD57BB065B5e8f2F438131",
      "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
      "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
    ],
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  },
};

const deployTokenRedeemer = async (owner: SignerWithAddress, vBNB: { address: string }): Promise<TokenRedeemer> => {
  const redeemerFactory: TokenRedeemer__factory = await ethers.getContractFactory("TokenRedeemer");
  const connectedFactory = redeemerFactory.connect(owner);
  const redeemer = await connectedFactory.deploy(owner.address, vBNB.address);
  await redeemer.deployed();
  return redeemer;
};

// bscmainnet interface differs from the one in this repo:
// Redeem event has a different signature
const bscmainnetVBNBInterface = new Interface([
  "function transfer(address,uint256) returns (bool)",
  "function mint() payable",
  "function borrow(uint256)",
  "function exchangeRateCurrent() returns (uint256)",
  "function borrowBalanceCurrent(address) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "event Redeem(address,uint256,uint256)",
  "event Transfer(address indexed,address indexed,uint256)",
]);

interface TokenRedeemerFixture {
  redeemer: TokenRedeemer;
  vToken: VBep20;
  vToken2: VBep20;
  vBNB: VBNB;
  vaiController: VAIController;
  vai: VAI;
  underlying: FaucetToken;
  underlying2: FaucetToken;
  owner: SignerWithAddress;
  supplier: SignerWithAddress;
  borrowers: SignerWithAddress[];
  treasury: SignerWithAddress;
}

interface VAIControllerFixture {
  vaiController: VAIController;
  vai: VAI;
}

const deployVAIController = async (acmAddress: string): Promise<VAIControllerFixture> => {
  const vaiControllerFactory = await ethers.getContractFactory("VAIController");
  const vaiControllerImpl = await vaiControllerFactory.deploy();
  const vaiUnitrollerFactory = await ethers.getContractFactory("VAIUnitroller");
  const vaiUnitroller = await vaiUnitrollerFactory.deploy();
  await vaiUnitroller._setPendingImplementation(vaiControllerImpl.address);
  await vaiControllerImpl._become(vaiUnitroller.address);
  const vaiController = await ethers.getContractAt("VAIController", vaiUnitroller.address);
  await vaiController.initialize();
  const vaiFactory = await ethers.getContractFactory("VAI");
  const vai = await vaiFactory.deploy(56);
  await vai.rely(vaiController.address);
  await vaiController.setVAIToken(vai.address);
  await vaiController.setAccessControl(acmAddress);
  return { vaiController, vai };
};

const setupLocal = async (): Promise<TokenRedeemerFixture> => {
  const [, owner, supplier, treasury, borrower1, borrower2, borrower3] = await ethers.getSigners();
  const { comptroller, vTokens, vBNB, accessControlManager } = await deployComptrollerWithMarkets({
    numBep20Tokens: 2,
  });
  const [vToken, vToken2] = vTokens;
  await comptroller.setIsBorrowAllowed(0, vBNB.address, true);
  await comptroller.setIsBorrowAllowed(0, vToken.address, true);
  await comptroller.setIsBorrowAllowed(0, vToken2.address, true);

  const redeemer = await deployTokenRedeemer(owner, vBNB);
  await comptroller._setMarketSupplyCaps(
    [vToken.address, vToken2.address, vBNB.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  await comptroller._setMarketBorrowCaps(
    [vToken.address, vToken2.address, vBNB.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );

  await comptroller["setMarketMaxLiquidationIncentive(address,uint256)"](vToken.address, parseUnits("1.1", 18));
  await comptroller["setMarketMaxLiquidationIncentive(address,uint256)"](vToken2.address, parseUnits("1.1", 18));
  await comptroller["setMarketMaxLiquidationIncentive(address,uint256)"](vBNB.address, parseUnits("1.1", 18));
  await comptroller["setCollateralFactor(address,uint256,uint256)"](
    vToken.address,
    parseUnits("0.9", 18),
    parseUnits("0.9", 18),
  );
  const underlying = await ethers.getContractAt("FaucetToken", await vToken.underlying());
  const underlying2 = await ethers.getContractAt("FaucetToken", await vToken2.underlying());

  const { vaiController, vai } = await deployVAIController(accessControlManager.address);
  await comptroller._setVAIController(vaiController.address);
  await vaiController._setComptroller(comptroller.address);
  await comptroller._setVAIMintRate(10000);

  await underlying.allocateTo(supplier.address, SUPPLIED_AMOUNT);
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(supplier).mint({ value: SUPPLIED_AMOUNT });

  await underlying2.allocateTo(treasury.address, SUPPLIED_AMOUNT.mul(2));
  await underlying2.connect(treasury).approve(vToken2.address, SUPPLIED_AMOUNT);
  await vToken2.connect(treasury).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(treasury).mint({ value: SUPPLIED_AMOUNT });

  const borrowers = [borrower1, borrower2, borrower3];
  for (const borrower of borrowers) {
    await underlying.allocateTo(borrower.address, SUPPLIED_AMOUNT);
    await underlying.connect(borrower).approve(vToken.address, SUPPLIED_AMOUNT);
    await vToken.connect(borrower).mint(SUPPLIED_AMOUNT);
    await comptroller.connect(borrower).enterMarkets([vToken.address]);
  }

  return {
    redeemer,
    supplier,
    vToken,
    underlying,
    owner,
    treasury,
    vToken2,
    underlying2,
    vBNB,
    vaiController,
    vai,
    borrowers,
  };
};

const setupFork = async (): Promise<TokenRedeemerFixture> => {
  const comptroller = await ethers.getContractAt("ComptrollerMock", addresses.bscmainnet.COMPTROLLER);
  const vToken = await ethers.getContractAt("VBep20", addresses.bscmainnet.VUSDC);
  const vToken2 = await ethers.getContractAt("VBep20", addresses.bscmainnet.VUSDT);
  const vBNB = new ethers.Contract(addresses.bscmainnet.VBNB, bscmainnetVBNBInterface, ethers.provider);
  const underlying = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken.underlying());
  const underlying2 = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken2.underlying());
  let treasuryAddress: string;
  try {
    treasuryAddress = await comptroller.treasuryAddress();
  } catch (err) {
    // Some fork blocks use a different Comptroller/diamond that doesn't expose the selector.
    // Fall back to a known on-chain holder so the fixture can continue.
    console.log("comptroller.treasuryAddress() selector missing on fork, using fallback holder");
    treasuryAddress = addresses.bscmainnet.USDC_HOLDERS[0];
  }
  const treasury = await initMainnetUser(treasuryAddress, SUPPLIED_AMOUNT.mul(2).add(parseEther("3")));
  // initialize timelock actor on the fork
  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseUnits("2"));

  const redeemer = await deployTokenRedeemer(timelock, vBNB);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vToken.address], [ethers.constants.MaxUint256]);
  const actions = { MINT: 0, ENTER_MARKET: 7 };
  await comptroller.connect(timelock)._setActionsPaused([vToken.address], [actions.MINT, actions.ENTER_MARKET], false);

  // Ensure supplier has enough ETH and tokens for mints
  const supplier = await initMainnetUser(addresses.bscmainnet.USDC_HOLDERS[0], SUPPLIED_AMOUNT.add(parseEther("10")));

  // helper: ensure an address has `required` underlying tokens by pulling from known holders
  const ensureUnderlyingBalance = async (target: string, required: BigNumber) => {
    const bal = await underlying.balanceOf(target);
    if (bal.gte(required)) return;
    let needed = required.sub(bal);
    for (const holderAddr of addresses.bscmainnet.USDC_HOLDERS) {
      if (holderAddr.toLowerCase() === target.toLowerCase()) continue;
      const holder = await initMainnetUser(holderAddr, parseEther("1"));
      const holderBal: BigNumber = await underlying.balanceOf(holderAddr);
      if (holderBal.isZero()) continue;
      const send = holderBal.gt(needed) ? needed : holderBal;
      try {
        await underlying.connect(holder).transfer(target, send);
      } catch (err) {
        // ignore transfer failures from a holder and continue to next
        console.log(`transfer from ${holderAddr} failed:`, err && (err as any).message);
        continue;
      }
      needed = needed.sub(send);
      if (needed.lte(0)) break;
    }
    const finalBal = await underlying.balanceOf(target);
    if (finalBal.lt(required)) {
      throw new Error(
        `Unable to source sufficient underlying for ${target}; have ${finalBal.toString()} need ${required.toString()}`,
      );
    }
  };

  await ensureUnderlyingBalance(supplier.address, SUPPLIED_AMOUNT);
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(supplier).mint({ value: SUPPLIED_AMOUNT.add(parseEther("1")) });

  // Ensure treasury has enough ETH and tokens for mints
  const treasurySigner = treasury;
  await underlying2.connect(treasurySigner).approve(vToken2.address, SUPPLIED_AMOUNT);
  await vToken2.connect(treasurySigner).mint(SUPPLIED_AMOUNT);
  // If treasury signer doesn't have enough ETH, re-init with larger balance
  const treasuryBalance = await ethers.provider.getBalance(treasurySigner.address);
  if (treasuryBalance.lt(SUPPLIED_AMOUNT)) {
    // re-init mainnet user with extra ETH
    await initMainnetUser(treasurySigner.address, SUPPLIED_AMOUNT.add(parseEther("10")));
  }
  await vBNB.connect(treasurySigner).mint({ value: SUPPLIED_AMOUNT.add(parseEther("1")) });

  const borrowerAddresses = addresses.bscmainnet.USDC_HOLDERS.slice(1);
  const borrowers = await Promise.all(
    borrowerAddresses.map(async borrowerAddress => {
      const borrower = await initMainnetUser(borrowerAddress, parseEther("1"));
      // ensure borrower has underlying tokens to mint
      await ensureUnderlyingBalance(borrower.address, SUPPLIED_AMOUNT);
      await underlying.connect(borrower).approve(vToken.address, SUPPLIED_AMOUNT);
      await vToken.connect(borrower).mint(SUPPLIED_AMOUNT);
      await comptroller.connect(borrower).enterMarkets([vToken.address]);
      return borrower;
    }),
  );

  const vaiController = await ethers.getContractAt("VAIController", await comptroller.vaiController(), timelock);

  // @todo: remove the following lines and update the fork block once this upgrade is executed on chain
  const vaiUnitroller = await ethers.getContractAt("VAIUnitroller", vaiController.address);
  const vaiControllerFactory = await ethers.getContractFactory("VAIController");
  const vaiControllerImpl = await vaiControllerFactory.deploy();
  await vaiUnitroller.connect(timelock)._setPendingImplementation(vaiControllerImpl.address);
  await vaiControllerImpl.connect(timelock)._become(vaiUnitroller.address);

  await vaiController.setBaseRate(0);
  await vaiController.setFloatRate(0);
  await vaiController.toggleOnlyPrimeHolderMint();
  const vai = await ethers.getContractAt("VAI", await vaiController.getVAIAddress(), timelock);

  return {
    redeemer,
    supplier,
    vToken,
    underlying,
    owner: timelock,
    treasury,
    vToken2,
    underlying2,
    vBNB,
    vaiController,
    vai,
    borrowers,
  };
};

// whether v is between 99.9% * v and 100.1% * v
const closeTo = (v: BigNumber) => around(v, v.mul(1).div(1000));

const test = (setup: () => Promise<TokenRedeemerFixture>) => () => {
  describe("TokenRedeemerUpgrade", () => {
    let redeemer: TokenRedeemer;
    let vaiController: VAIController;
    let vai: VAI;
    let owner: SignerWithAddress;
    let borrowers: SignerWithAddress[];
    let someone: SignerWithAddress;
    let treasury: SignerWithAddress;

    beforeEach(async () => {
      ({ redeemer, owner, treasury, vaiController, vai, borrowers } = await loadFixture(setup));
      [someone] = await ethers.getSigners();
    });

    describe("batchRepayVAI", () => {
      let borrower: SignerWithAddress;
      let repayment: TokenRedeemer.RepaymentStruct;
      let repayments: TokenRedeemer.RepaymentStruct[];

      beforeEach(async () => {
        borrower = borrowers[0];
        repayment = { borrower: borrower.address, amount: ethers.constants.MaxUint256 };
        repayments = borrowers.map(b => ({ borrower: b.address, amount: ethers.constants.MaxUint256 }));
      });

      after(async () => {
        await ethers.provider.send("evm_setAutomine", [true]);
      });

      it("fails if called by a non-owner", async () => {
        await expect(
          redeemer.connect(someone).batchRepayVAI(vaiController.address, [], treasury.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("repays one borrow successfully", async () => {
        await vaiController.connect(borrower).mintVAI(BORROWED_AMOUNT);
        await vai.mint(redeemer.address, BORROWED_AMOUNT);
        expect(await vaiController.getVAIRepayAmount(borrower.address)).to.equal(BORROWED_AMOUNT);
        await redeemer.connect(owner).batchRepayVAI(vaiController.address, [repayment], treasury.address);
        expect(await vaiController.getVAIRepayAmount(borrower.address)).to.equal(0);
      });

      it("repays multiple borrows successfully and transfers refund to treasury", async () => {
        for (const borrower of borrowers) {
          await vaiController.connect(borrower).mintVAI(BORROWED_AMOUNT);
        }
        await vai.mint(redeemer.address, BORROWED_AMOUNT.mul(borrowers.length + 1));
        const tx = await redeemer.connect(owner).batchRepayVAI(vaiController.address, repayments, treasury.address);
        for (const borrower of borrowers) {
          expect(await vaiController.getVAIRepayAmount(borrower.address)).to.equal(0);
        }
        await expect(tx).to.changeTokenBalance(vai, treasury.address, BORROWED_AMOUNT);
      });

      it("repays up to caps", async () => {
        await vaiController.connect(borrowers[0]).mintVAI(parseUnits("1", 18));
        await vaiController.connect(borrowers[1]).mintVAI(parseUnits("2", 18));
        await vaiController.connect(borrowers[2]).mintVAI(parseUnits("3", 18));
        await vai.mint(redeemer.address, parseUnits("1.5", 18));
        const repayments = borrowers.map(b => ({ borrower: b.address, amount: parseUnits("0.5", 18) }));
        await redeemer.connect(owner).batchRepayVAI(vaiController.address, repayments, treasury.address);
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.satisfy(closeTo(parseUnits("0.5", 18)));
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.satisfy(closeTo(parseUnits("1.5", 18)));
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.satisfy(closeTo(parseUnits("2.5", 18)));
      });

      it("partially repays borrows if insufficient VAI", async () => {
        await vaiController.connect(borrowers[0]).mintVAI(parseUnits("50", 18));
        await vaiController.connect(borrowers[1]).mintVAI(parseUnits("100", 18));
        await vaiController.connect(borrowers[2]).mintVAI(parseUnits("200", 18));
        await vai.mint(redeemer.address, parseUnits("100", 18));
        await redeemer.connect(owner).batchRepayVAI(vaiController.address, repayments, treasury.address);
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.equal(0);
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.equal(parseUnits("50", 18));
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.equal(parseUnits("200", 18));
      });

      it("can repay small amounts without failure", async () => {
        await vaiController.connect(borrowers[0]).mintVAI(1);
        await vaiController.connect(borrowers[1]).mintVAI(2);
        await vaiController.connect(borrowers[2]).mintVAI(3);
        await vai.mint(redeemer.address, 3);
        expect(await vai.balanceOf(redeemer.address)).to.equal(3);
        await ethers.provider.send("evm_setAutomine", [false]);
        await vaiController.setBaseRate(parseUnits("420480", 18)); // 1% each block
        await mine(99);
        await vaiController.accrueVAIInterest();
        await mine();
        // 100 blocks here, so debt before the repayment is twice the initial amount
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.equal(2);
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.equal(4);
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.equal(6);
        // We transfer the refund to someone instead of treasury here so that we don't need
        // to account for interest that is also transferred to treasury
        const tx = await redeemer.connect(owner).batchRepayVAI(vaiController.address, repayments, someone.address);
        await mine();
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.equal(0);
        // The second repayment doesn't happen due to rounding in VAIController
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.equal(4);
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.equal(6);
        await ethers.provider.send("evm_setAutomine", [true]);
        // Still transfers 1 wei refund to treasury
        await expect(tx).to.changeTokenBalance(vai, someone.address, 1);
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 69536042;
  forking(blockNumber, test(setupFork));
} else {
  test(setupLocal)();
}
