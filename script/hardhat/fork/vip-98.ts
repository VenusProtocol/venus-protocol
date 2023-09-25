import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { ComptrollerInterface, IERC20Upgradeable, PriceOracle, VBep20 } from "../../../typechain";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const COMPTROLLER = "0xfd36e2c2a6789db23113685031d7f16329158384";
const NEW_VTRX = "0xC5D3466aA484B040eE977073fcF337f2c00071c1";
const OLD_VTRX = "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93";
const VTRX_RESETTER = "0x42178F50f838605E5B925A574ed8D630878F2EE1"; // A contract that updates the symbol and name
const VTOKEN_IMPLEMENTATION = "0x13f816511384D3534783241ddb5751c4b7a7e148"; // Original implementation
const NEW_TRX = "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3";
const TRX_HOLDER = "0x2C7A1398368A38489bB6Dc53B79B3e416B531636";
const TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const INITIAL_FUNDING = "24750000000";
const INITIAL_VTOKENS = "2475000000000";

const Actions = {
  MINT: 0,
  BORROW: 2,
  ENTER_MARKETS: 7,
};

const vip98 = () => {
  const meta = {
    version: "v2",
    title: "VIP-98 TRON Contract Migration",
    description: `
This VIP relates to the TRON Contract swap on BNB Chain as announced earlier this week by TRON and Binance. This VIP will perform the following specific actions: 

* Borrowing, supplying and enabling TRX as collateral will be paused for the current TRX market on Venus. It will be renamed to ‘TRXOLD’.
* TRX Borrowers **should immediately repay their TRXOLD Loans** to avoid paying more for their TRX if a liquidity shortage happens. 
* XVS Distributions will be set to 0 for ‘TRXOLD’ market and set to 12.5 XVS per day in the new TRX market.
* Reserve factor will be increased in the ‘TRXOLD’ market, to 100%
* Upgrade the Old vTRX market, to use a different name: "Venus OLDTRX"
* Add a new market, using the new BEP20 TRX contract as underlying. Until sufficient liquidity is in place, Gauntlet has recommended the following settings: 
  - CF: 0% 
  - reserve factor: 25%
  - borrow cap: 100,000 TRX
  - supply cap: 180,000 TRX


**Binance will also support the TRON (TRX) Contract Swap**

- On 2023-02-27 04:00 (UTC), deposits and withdrawals of TRX (BEP20) will be suspended.
- Spot trading, margin trading, futures trading, Binance Pay and Simple Earn subscriptions will not be affected during the contract swap.
- Binance will handle all technical requirements involved for all users holding TRX in their Binance accounts.
- A separate announcement will be made once the contract swap is complete and deposits and withdrawals of TRX (BEP20) are open.
- After the contract swap, old TRX tokens will assume TRXOLD as the ticker. Users who deposit TRXOLD via the old TRX (BEP20) smart contract will be able to swap their old TRX tokens (TRXOLD) for new TRX tokens using the convert function.

**Old TRX (BEP20) smart contract address:** 0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B

**New TRX (BEP20) smart contract address:** 0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3

If you wish to perform the token SWAP by yourself, please carefully read the guide on how to migrate your Binance-peg TRX to BTTC-bridged Version TRX by referring to the following [Guide for Migrating Binance-Peg TRX to BTTC-Bridged Version TRX](https://trondao.org/blog/2023/02/15/guide-for-migrating-binance-peg-trx-to-bttc-bridged-version-trx/).
    `,
    forDescription: "I agree that Venus Protocol should proceed with the TRX contract migration",
    againstDescription: "I do not think that Venus Protocol should proceed with the TRX contract migration",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the TRX contract migration or not",
  };

  return makeProposal(
    [
      {
        target: COMPTROLLER,
        signature: "_setActionsPaused(address[],uint8[],bool)",
        params: [[OLD_VTRX], [Actions.MINT, Actions.BORROW, Actions.ENTER_MARKETS], true],
      },
      {
        target: OLD_VTRX,
        signature: "_setImplementation(address,bool,bytes)",
        params: [VTRX_RESETTER, false, "0x"],
      },
      {
        target: OLD_VTRX,
        signature: "_setImplementation(address,bool,bytes)",
        params: [VTOKEN_IMPLEMENTATION, false, "0x"],
      },
      {
        target: OLD_VTRX,
        signature: "_setReserveFactor(uint256)",
        params: ["1000000000000000000"],
      },
      {
        target: COMPTROLLER,
        signature: "_supportMarket(address)",
        params: [NEW_VTRX],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketSupplyCaps(address[],uint256[])",
        params: [[NEW_VTRX], ["180000000000"]],
      },
      {
        target: COMPTROLLER,
        signature: "_setMarketBorrowCaps(address[],uint256[])",
        params: [[NEW_VTRX], ["100000000000"]],
      },
      {
        target: COMPTROLLER,
        signature: "_setVenusSpeeds(address[],uint256[],uint256[])",
        params: [
          [OLD_VTRX, NEW_VTRX],
          ["0", "217013888888889"],
          ["0", "217013888888889"],
        ],
      },
      {
        target: NEW_TRX,
        signature: "approve(address,uint256)",
        params: [NEW_VTRX, 0],
      },
      {
        target: NEW_TRX,
        signature: "approve(address,uint256)",
        params: [NEW_VTRX, INITIAL_FUNDING],
      },
      {
        target: NEW_VTRX,
        signature: "mint(uint256)",
        params: [INITIAL_FUNDING],
      },
      {
        target: NEW_VTRX,
        signature: "transfer(address,uint256)",
        params: [TRX_HOLDER, INITIAL_VTOKENS],
      },
      {
        target: NEW_VTRX,
        signature: "_acceptAdmin()",
        params: [],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(25892445, () => {
  testVip("VIP-98 TRON Contract Migration", vip98());
});

forking(25892445, () => {
  let comptroller: ComptrollerInterface;
  let trx: IERC20Upgradeable;
  let vTrxOld: VBep20;
  let vTrx: VBep20;
  let oracle: PriceOracle;

  before(async () => {
    comptroller = await ethers.getContractAt("ComptrollerInterface", COMPTROLLER);
    const oracleAddress = await comptroller.oracle();
    oracle = await ethers.getContractAt("PriceOracle", oracleAddress);
    trx = await ethers.getContractAt("IERC20Upgradeable", NEW_TRX);
    vTrxOld = await ethers.getContractAt("VBep20", OLD_VTRX);
    vTrx = await ethers.getContractAt("VBep20", NEW_VTRX);

    await pretendExecutingVip(vip98());
  });

  describe("Post-VIP behavior", async () => {
    it('sets TRXOLD name to "Venus TRXOLD"', async () => {
      expect(await vTrxOld.name()).to.equal("Venus TRXOLD");
    });

    it('sets TRXOLD symbol to "vTRXOLD"', async () => {
      expect(await vTrxOld.symbol()).to.equal("vTRXOLD");
    });

    it("restores TRXOLD implementation to the original one", async () => {
      const vTrxOldDelegator = await ethers.getContractAt("VBep20Delegator", OLD_VTRX);
      const impl = await vTrxOldDelegator.implementation();
      expect(impl).to.equal(VTOKEN_IMPLEMENTATION);
    });

    it("pauses TRXOLD minting", async () => {
      const mintingPaused = await comptroller.actionPaused(OLD_VTRX, Actions.MINT);
      expect(mintingPaused).to.equal(true);
    });

    it("pauses TRXOLD borrowing", async () => {
      const mintingPaused = await comptroller.actionPaused(OLD_VTRX, Actions.BORROW);
      expect(mintingPaused).to.equal(true);
    });

    it("pauses entering TRXOLD market", async () => {
      const mintingPaused = await comptroller.actionPaused(OLD_VTRX, Actions.ENTER_MARKETS);
      expect(mintingPaused).to.equal(true);
    });

    it("sets TRXOLD reserve factor to 100%", async () => {
      const newReserveFactor = await vTrxOld.reserveFactorMantissa();
      expect(newReserveFactor).to.equal(parseUnits("1.0", 18));
    });

    it("adds a new TRX market", async () => {
      const market = await comptroller.markets(NEW_VTRX);
      expect(market.isListed).to.equal(true);
      expect(market.collateralFactorMantissa).to.equal(0);
    });

    it("sets the supply cap to 180,000 TRX", async () => {
      const newCap = await comptroller.supplyCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("180000", 6));
    });

    it("sets the borrow cap to 100,000 TRX", async () => {
      const newCap = await comptroller.borrowCaps(NEW_VTRX);
      expect(newCap).to.equal(parseUnits("100000", 6));
    });

    it("does not leave TRX on the balance of the governance", async () => {
      const timelockBalance = await trx.balanceOf(TIMELOCK);
      expect(timelockBalance).to.equal(0);
    });

    it("does not leave vTRX on the balance of the governance", async () => {
      const timelockBalance = await vTrx.balanceOf(TIMELOCK);
      expect(timelockBalance).to.equal(0);
    });

    it("moves 24,750 vTRX to the community wallet", async () => {
      const communityBalance = await vTrx.balanceOf(TRX_HOLDER);
      expect(communityBalance).to.equal(parseUnits("24750", 8));
    });

    it("has the correct oracle price", async () => {
      const price = await oracle.getUnderlyingPrice(NEW_VTRX);
      expect(price).to.equal(parseUnits("0.0687784", 30));
    });

    it("sets the admin to governance", async () => {
      expect(await vTrx.admin()).to.equal(TIMELOCK);
    });
  });
});
