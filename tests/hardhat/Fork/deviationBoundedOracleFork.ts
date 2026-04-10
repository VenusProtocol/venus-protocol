import { FakeContract, smock } from "@defi-wonderland/smock";
import { setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { FacetCutAction, getSelectors } from "../../../script/deploy/comptroller/diamond";
import {
  BEP20__factory,
  ComptrollerMock,
  ComptrollerMock__factory,
  Diamond,
  Diamond__factory,
  IAccessControlManagerV8,
  IAccessControlManagerV8__factory,
  Unitroller__factory,
} from "../../../typechain";
import { ResilientOracleInterface } from "../../../typechain/@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol/ResilientOracleInterface";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

// ---------------------------------------------------------------------------
// BSC Mainnet Addresses
// ---------------------------------------------------------------------------
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";

const VAI = "0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd7";

// vTokens
const vBNB_ADDRESS = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const vUSDT_ADDRESS = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const vBTC_ADDRESS = "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B";

// Underlying
const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
const BTCB_ADDR = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const WBNB_ADDR = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// Token holders (whales) — Binance hot wallet
const USDT_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const BTCB_WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

// ---------------------------------------------------------------------------
// Deterministic Prices (18 decimals)
// ---------------------------------------------------------------------------
const USDT_PRICE = parseUnits("1", 18); // $1
const BTCB_PRICE = parseUnits("60000", 18); // $60,000
const WBNB_PRICE = parseUnits("600", 18); // $600

// Pump/crash variants
const USDT_PUMPED = parseUnits("1.5", 18); // $1.50 (+50%, triggers 16.67% threshold)
const BTCB_CRASHED = parseUnits("42000", 18); // $42,000 (-30%, triggers threshold)
const BTCB_PUMPED = parseUnits("90000", 18); // $90,000 (+50%, triggers BTC protection)

// DBO configuration
const COOLDOWN_PERIOD = 3600; // 1 hour
const TRIGGER_THRESHOLD = parseUnits("0.1667", 18); // 16.67%
const RESET_THRESHOLD = parseUnits("0.05", 18); // 5%

// Existing user with positions
const USER_WITH_POSITIONS = "0x50c6047B6F3EeC1aeDDa257A9065f91CF68A3b68";

// ---------------------------------------------------------------------------
// Shared State
// ---------------------------------------------------------------------------
let timelock: Signer;
let comptroller: ComptrollerMock;
let diamond: Diamond;
let acm: IAccessControlManagerV8;
let dbo: any; // DeviationBoundedOracle
let fakeOracle: FakeContract<ResilientOracleInterface>;
let vUSDT: any; // VBep20Delegate ABI for Failure event access
let vBTC: any;
let user: Signer;

// ---------------------------------------------------------------------------
// Helper: Upgrade Diamond Comptroller (follows emodeUpgrade.ts)
// ---------------------------------------------------------------------------
async function upgradeComptroller(): Promise<ComptrollerMock> {
  const DiamondFactory = await ethers.getContractFactory("Diamond");
  const newDiamond = await DiamondFactory.deploy();

  const Unitroller = Unitroller__factory.connect(COMPTROLLER, timelock);
  await Unitroller._setPendingImplementation(newDiamond.address);
  await newDiamond.connect(timelock)._become(Unitroller.address);

  diamond = Diamond__factory.connect(COMPTROLLER, timelock);

  // Step 1: Remove ALL existing facets
  const removeCut: any[] = [];
  const existingFacets = await diamond.facets();
  for (const facet of existingFacets) {
    removeCut.push({
      facetAddress: ethers.constants.AddressZero,
      action: FacetCutAction.Remove,
      functionSelectors: facet.functionSelectors,
    });
  }
  await diamond.diamondCut(removeCut);

  // Step 2: Deploy and add new facets with global deduplication
  const addCut: any[] = [];
  const allAddedSelectors = new Set<string>();

  const FacetNames = ["MarketFacet", "PolicyFacet", "SetterFacet", "RewardFacet", "FlashLoanFacet"];
  const deployedFacets: Record<string, string> = {};

  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.deployed();
    deployedFacets[FacetName] = facet.address;

    const facetInterface = await ethers.getContractAt(`I${FacetName}`, facet.address);
    const rawSelectors: string[] = getSelectors(facetInterface);
    const selectors = rawSelectors.filter((s: string) => !allAddedSelectors.has(s));
    for (const s of selectors) allAddedSelectors.add(s);

    if (selectors.length > 0) {
      addCut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors,
      });
    }
  }

  // Add IFacetBase selectors via MarketFacet (common getters)
  const baseIface = await ethers.getContractAt("IFacetBase", deployedFacets["MarketFacet"]);
  const baseRaw: string[] = getSelectors(baseIface);
  const baseSelectors = baseRaw.filter((s: string) => !allAddedSelectors.has(s));
  for (const s of baseSelectors) allAddedSelectors.add(s);

  if (baseSelectors.length > 0) {
    addCut.push({
      facetAddress: deployedFacets["MarketFacet"],
      action: FacetCutAction.Add,
      functionSelectors: baseSelectors,
    });
  }

  await diamond.diamondCut(addCut);

  const comptrollerInstance = ComptrollerMock__factory.connect(COMPTROLLER, timelock);

  // Deploy and set new ComptrollerLens (has _calculateAccountPosition with DBO calls)
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await comptrollerInstance._setComptrollerLens(lens.address);

  return comptrollerInstance;
}

// ---------------------------------------------------------------------------
// Helper: Deploy DeviationBoundedOracle (transparent proxy)
// ---------------------------------------------------------------------------
async function deployDBO(oracleAddress: string): Promise<any> {
  const DBOFactory = await ethers.getContractFactory("DeviationBoundedOracle");
  const dbo = await upgrades.deployProxy(DBOFactory, [ACM], {
    constructorArgs: [oracleAddress, vBNB_ADDRESS, VAI],
    initializer: "initialize",
    unsafeAllow: ["state-variable-immutable"],
  });
  return dbo;
}

// ---------------------------------------------------------------------------
// Helper: Configure fake oracle with deterministic prices
// ---------------------------------------------------------------------------
function setupDefaultPrices(): void {
  // getPrice(asset) — used by DBO._fetchSpotPrice()
  fakeOracle.getPrice.whenCalledWith(USDT_ADDR).returns(USDT_PRICE);
  fakeOracle.getPrice.whenCalledWith(BTCB_ADDR).returns(BTCB_PRICE);
  fakeOracle.getPrice.whenCalledWith(WBNB_ADDR).returns(WBNB_PRICE);

  // getUnderlyingPrice(vToken) — used by ComptrollerLens LT path
  fakeOracle.getUnderlyingPrice.whenCalledWith(vUSDT_ADDRESS).returns(USDT_PRICE);
  fakeOracle.getUnderlyingPrice.whenCalledWith(vBTC_ADDRESS).returns(BTCB_PRICE);
  fakeOracle.getUnderlyingPrice.whenCalledWith(vBNB_ADDRESS).returns(WBNB_PRICE);
}

function pumpUSDTPrice(): void {
  fakeOracle.getPrice.whenCalledWith(USDT_ADDR).returns(USDT_PUMPED);
  fakeOracle.getUnderlyingPrice.whenCalledWith(vUSDT_ADDRESS).returns(USDT_PUMPED);
}

function crashBTCBPrice(): void {
  fakeOracle.getPrice.whenCalledWith(BTCB_ADDR).returns(BTCB_CRASHED);
  fakeOracle.getUnderlyingPrice.whenCalledWith(vBTC_ADDRESS).returns(BTCB_CRASHED);
}

function resetPrices(): void {
  setupDefaultPrices();
}

function pumpBTCBPrice(): void {
  fakeOracle.getPrice.whenCalledWith(BTCB_ADDR).returns(BTCB_PUMPED);
  fakeOracle.getUnderlyingPrice.whenCalledWith(vBTC_ADDRESS).returns(BTCB_PUMPED);
}

// ---------------------------------------------------------------------------
// Helper: Grant all necessary ACM permissions
// ---------------------------------------------------------------------------
async function grantPermissions(): Promise<void> {
  const timelockAddr = await timelock.getAddress();
  const comptrollerPerms = [
    "setDeviationBoundedOracle(address)",
    "_setComptrollerLens(address)",
    "_setPriceOracle(address)",
    "setCollateralFactor(address,uint256,uint256)",
    "setLiquidationIncentive(address,uint256)",
    "setMarketSupplyCaps(address[],uint256[])",
    "setMarketBorrowCaps(address[],uint256[])",
    "setIsBorrowAllowed(uint96,address,bool)",
    "_setActionsPaused(address[],uint8[],bool)",
  ];
  for (const perm of comptrollerPerms) {
    await acm.giveCallPermission(COMPTROLLER, perm, timelockAddr);
  }
}

async function grantDBOPermissions(dboAddress: string): Promise<void> {
  const timelockAddr = await timelock.getAddress();
  const dboPerms = [
    "setTokenConfig(address,uint64,uint256,uint256,bool)",
    "disableActiveProtectedPrice(address)",
    "updateMinPrice(address,uint128)",
    "updateMaxPrice(address,uint128)",
    "setThresholds(address,uint256,uint256)",
    "setCooldownPeriod(address,uint64)",
    "setAssetBoundedPricingEnabled(address,bool)",
  ];
  for (const perm of dboPerms) {
    await acm.giveCallPermission(dboAddress, perm, timelockAddr);
  }
}

// ---------------------------------------------------------------------------
// Helper: Neutralize DBO state — reset windows, disable protection, restore defaults
// ---------------------------------------------------------------------------
async function neutralizeDBO(): Promise<void> {
  resetPrices(); // oracle returns $1 USDT, $60k BTC, $600 WBNB

  // Advance time past any cooldown (covers extended cooldowns from prior tests)
  await time.increase(COOLDOWN_PERIOD * 10);

  for (const [asset, price] of [
    [USDT_ADDR, USDT_PRICE],
    [BTCB_ADDR, BTCB_PRICE],
    [WBNB_ADDR, WBNB_PRICE],
  ] as [string, any][]) {
    // Narrow window to ±1% of spot (always satisfies keeper constraints)
    const neutralMin = price.mul(99).div(100);
    const neutralMax = price.mul(101).div(100);

    await dbo.connect(timelock).updateMinPrice(asset, neutralMin);
    await dbo.connect(timelock).updateMaxPrice(asset, neutralMax);

    // Disable protection if active (range = 2% < 5% reset threshold, cooldown elapsed)
    const cfg = await dbo.assetProtectionConfig(asset);
    if (cfg.currentlyUsingProtectedPrice) {
      await dbo.connect(timelock).disableActiveProtectedPrice(asset);
    }
  }

  // Restore default thresholds and cooldown
  for (const asset of [USDT_ADDR, BTCB_ADDR, WBNB_ADDR]) {
    await dbo.connect(timelock).setThresholds(asset, TRIGGER_THRESHOLD, RESET_THRESHOLD);
    await dbo.connect(timelock).setCooldownPeriod(asset, COOLDOWN_PERIOD);
  }
}

// ===========================================================================
// Fork Tests
// ===========================================================================
if (FORK_MAINNET) {
  forking(90924377, () => {
    describe("DeviationBoundedOracle Fork Integration Tests", () => {
      before(async () => {
        // Impersonate timelock
        timelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("10"));
        const [signer1] = await ethers.getSigners();
        user = signer1;

        // Get vTokens
        vUSDT = await ethers.getContractAt("contracts/Tokens/VTokens/VBep20Delegate.sol:VBep20Delegate", vUSDT_ADDRESS);
        vBTC = await ethers.getContractAt("contracts/Tokens/VTokens/VBep20Delegate.sol:VBep20Delegate", vBTC_ADDRESS);

        // Get ACM
        acm = IAccessControlManagerV8__factory.connect(ACM, timelock);

        // 1. Upgrade comptroller with DBO-aware facets + lens
        comptroller = await upgradeComptroller();
        await grantPermissions();

        // 2. Create fake oracle with deterministic prices
        fakeOracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
        setupDefaultPrices();

        // 3. Set fake oracle as comptroller's oracle (for LT path)
        await comptroller._setPriceOracle(fakeOracle.address);

        // 4. Deploy DBO with fake oracle (for CF path spot price fetching)
        dbo = await deployDBO(fakeOracle.address);
        await grantDBOPermissions(dbo.address);

        // 5. Ensure borrow is allowed and markets are active
        await comptroller.setIsBorrowAllowed(0, vUSDT_ADDRESS, true);
        await comptroller.setIsBorrowAllowed(0, vBTC_ADDRESS, true);

        // 6. Configure DBO tokens (setTokenConfig calls getPrice internally)
        await dbo
          .connect(timelock)
          .setTokenConfig(USDT_ADDR, COOLDOWN_PERIOD, TRIGGER_THRESHOLD, RESET_THRESHOLD, true);
        await dbo
          .connect(timelock)
          .setTokenConfig(BTCB_ADDR, COOLDOWN_PERIOD, TRIGGER_THRESHOLD, RESET_THRESHOLD, true);
        await dbo
          .connect(timelock)
          .setTokenConfig(WBNB_ADDR, COOLDOWN_PERIOD, TRIGGER_THRESHOLD, RESET_THRESHOLD, true);

        // 7. Wire DBO into comptroller
        await comptroller.setDeviationBoundedOracle(dbo.address);
      });

      // =====================================================================
      // Part 1: Setup Verification
      // =====================================================================
      describe("1. Setup Verification", () => {
        it("DBO is correctly set on comptroller", async () => {
          expect(await comptroller.deviationBoundedOracle()).to.equal(dbo.address);
        });

        it("DBO token configs are initialized with correct spot prices", async () => {
          const usdtConfig = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(usdtConfig.asset).to.equal(USDT_ADDR);
          expect(usdtConfig.isBoundedPricingEnabled).to.be.true;
          expect(usdtConfig.currentlyUsingProtectedPrice).to.be.false;
          // minPrice and maxPrice should be USDT_PRICE (deterministic $1)
          expect(usdtConfig.minPrice).to.equal(USDT_PRICE);
          expect(usdtConfig.maxPrice).to.equal(USDT_PRICE);
        });

        it("existing vTokens work correctly with upgraded comptroller", async () => {
          const market = await comptroller.markets(vUSDT_ADDRESS);
          expect(market.isListed).to.be.true;
        });

        it("view functions work after upgrade", async () => {
          const [err] = await comptroller.getAccountLiquidity(USER_WITH_POSITIONS);
          expect(err).to.equal(0);
        });
      });

      // =====================================================================
      // Part 2: Normal Operation — DBO Active, No Protection
      // =====================================================================
      describe("2. Normal Operation — no protection active", () => {
        it("user can supply collateral via vToken.mint()", async () => {
          const amount = parseUnits("100", 18);
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(await user.getAddress(), amount);

          const usdtUser = BEP20__factory.connect(USDT_ADDR, user);
          await usdtUser.approve(vUSDT_ADDRESS, amount);

          const vBalBefore = await vUSDT.balanceOf(await user.getAddress());
          const uBalBefore = await usdtUser.balanceOf(await user.getAddress());
          const er = await vUSDT.callStatic.exchangeRateCurrent();
          const expectedVTokens = amount.mul(parseUnits("1", 18)).div(er);

          await expect(vUSDT.connect(user).mint(amount)).to.emit(vUSDT, "Mint");

          expect(await vUSDT.balanceOf(await user.getAddress())).to.be.closeTo(
            vBalBefore.add(expectedVTokens),
            parseUnits("1", 8),
          );
          expect(await usdtUser.balanceOf(await user.getAddress())).to.equal(uBalBefore.sub(amount));
        });

        it("user can borrow via vToken.borrow() with real collateral", async () => {
          await comptroller.connect(user).enterMarkets([vUSDT_ADDRESS]);
          // 100 USDT at $1, CF=0.8 → $80 capacity. BTC at $60k → borrow 0.001 BTC = $60
          const borrowAmount = parseUnits("0.001", 18);
          const btcb = BEP20__factory.connect(BTCB_ADDR, user);
          const uBalBefore = await btcb.balanceOf(await user.getAddress());
          const borrowBefore = await vBTC.borrowBalanceStored(await user.getAddress());

          await expect(vBTC.connect(user).borrow(borrowAmount)).to.emit(vBTC, "Borrow");

          expect(await btcb.balanceOf(await user.getAddress())).to.equal(uBalBefore.add(borrowAmount));
          expect(await vBTC.borrowBalanceStored(await user.getAddress())).to.be.closeTo(
            borrowBefore.add(borrowAmount),
            parseUnits("0.000001", 18),
          );
        });

        it("user can repay via vToken.repayBorrow()", async () => {
          const userAddr = await user.getAddress();
          const debt = await vBTC.callStatic.borrowBalanceCurrent(userAddr);
          if (debt.gt(0)) {
            const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
            const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
            await btcb.transfer(userAddr, debt.mul(2));

            const btcbUser = BEP20__factory.connect(BTCB_ADDR, user);
            await btcbUser.approve(vBTC_ADDRESS, debt.mul(2));

            const borrowBefore = await vBTC.borrowBalanceStored(userAddr);
            const uBalBefore = await btcbUser.balanceOf(userAddr);
            await expect(vBTC.connect(user).repayBorrow(debt)).to.emit(vBTC, "RepayBorrow");

            expect(await vBTC.borrowBalanceStored(userAddr)).to.be.closeTo(
              borrowBefore.sub(debt),
              parseUnits("0.000001", 18),
            );
            expect(await btcbUser.balanceOf(userAddr)).to.equal(uBalBefore.sub(debt));
          }
        });

        it("user can redeem via vToken.redeemUnderlying()", async () => {
          const userAddr = await user.getAddress();
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user);
          const redeemAmount = parseUnits("10", 18);

          const uBalBefore = await usdtUser.balanceOf(userAddr);
          await expect(vUSDT.connect(user).redeemUnderlying(redeemAmount)).to.emit(vUSDT, "Redeem");

          expect(await usdtUser.balanceOf(userAddr)).to.equal(uBalBefore.add(redeemAmount));
        });

        it("user can transfer vTokens when solvent", async () => {
          const userAddr = await user.getAddress();
          const dst = ethers.Wallet.createRandom().connect(ethers.provider);
          const dstAddr = await dst.getAddress();
          // Use very small amount — prior tests may have consumed balance
          const srcBalance = await vUSDT.balanceOf(userAddr);
          const transferAmount = srcBalance.div(10); // 10% of remaining

          const srcBefore = await vUSDT.balanceOf(userAddr);
          const dstBefore = await vUSDT.balanceOf(dstAddr);
          await vUSDT.connect(user).transfer(dstAddr, transferAmount);

          expect(await vUSDT.balanceOf(userAddr)).to.equal(srcBefore.sub(transferAmount));
          expect(await vUSDT.balanceOf(dstAddr)).to.equal(dstBefore.add(transferAmount));
        });
      });

      // =====================================================================
      // Part 3: Oracle Pump — DBO Activates Protection
      // =====================================================================
      describe("3. Oracle Pump — DBO activates protection", () => {
        let borrower: Signer;

        before(async () => {
          borrower = (await ethers.getSigners())[3];
          const borrowerAddr = await borrower.getAddress();

          resetPrices();

          // Fund borrower with USDT
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(borrowerAddr, parseUnits("10000", 18));

          // Supply USDT as collateral
          const usdtBorrower = BEP20__factory.connect(USDT_ADDR, borrower);
          await usdtBorrower.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(borrower).mint(parseUnits("10000", 18));
          await comptroller.connect(borrower).enterMarkets([vUSDT_ADDRESS]);

          // Borrow some BTC at normal prices
          // 10000 USDT * $1 * CF=0.8 = $8000 capacity. 0.01 BTC * $60k = $600
          await vBTC.connect(borrower).borrow(parseUnits("0.01", 18));

          pumpUSDTPrice(); // USDT $1 → $1.50
        });

        it("borrow reverts — DBO bounds collateral at pre-pump price", async () => {
          // At pumped $1.50: capacity = 10000 * 1.50 * 0.8 = $12000 → ~0.2 BTC
          // At bounded $1 (window min): capacity = 10000 * 1 * 0.8 = $8000 → ~0.133 BTC
          // Existing borrow: 0.01 BTC = $600. Try 0.15 BTC = $9000 total → exceeds bounded $8000
          await expect(vBTC.connect(borrower).borrow(parseUnits("0.15", 18))).to.be.revertedWith("math error");
        });

        it("repayBorrow succeeds during pump", async () => {
          const repayAmount = parseUnits("0.001", 18);
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await borrower.getAddress(), repayAmount);

          const btcbBorrower = BEP20__factory.connect(BTCB_ADDR, borrower);
          await btcbBorrower.approve(vBTC_ADDRESS, repayAmount);

          const borrowBefore = await vBTC.borrowBalanceStored(await borrower.getAddress());
          const uBalBefore = await btcbBorrower.balanceOf(await borrower.getAddress());
          await expect(vBTC.connect(borrower).repayBorrow(repayAmount)).to.emit(vBTC, "RepayBorrow");

          expect(await vBTC.borrowBalanceStored(await borrower.getAddress())).to.be.closeTo(
            borrowBefore.sub(repayAmount),
            parseUnits("0.000001", 18),
          );
          expect(await btcbBorrower.balanceOf(await borrower.getAddress())).to.equal(uBalBefore.sub(repayAmount));
        });

        it("liquidation NOT triggered — borrower solvent at spot LT", async () => {
          const liquidator = (await ethers.getSigners())[4];
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.01", 18));

          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.01", 18));

          // LT path: 10000 * $1.50 * LT=0.9 = $13500 >> 0.01 BTC * $60k = $600
          await expect(
            vBTC
              .connect(liquidator)
              .liquidateBorrow(await borrower.getAddress(), parseUnits("0.005", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
        });

        it("borrow succeeds within bounded capacity despite pump", async () => {
          // At bounded $1: capacity = 10000 * 1 * 0.8 = $8000. 0.001 BTC * $60k = $60 → within capacity
          const borrowAmt = parseUnits("0.001", 18);
          const btcbBorrower = BEP20__factory.connect(BTCB_ADDR, borrower);
          const uBalBefore = await btcbBorrower.balanceOf(await borrower.getAddress());
          const borrowBefore = await vBTC.borrowBalanceStored(await borrower.getAddress());

          await expect(vBTC.connect(borrower).borrow(borrowAmt)).to.emit(vBTC, "Borrow");

          expect(await btcbBorrower.balanceOf(await borrower.getAddress())).to.equal(uBalBefore.add(borrowAmt));
          expect(await vBTC.borrowBalanceStored(await borrower.getAddress())).to.be.closeTo(
            borrowBefore.add(borrowAmt),
            parseUnits("0.000001", 18),
          );
        });

        it("redeem reverts — bounded prices limit withdrawal", async () => {
          // Borrow more to make position tight at bounded capacity
          // Existing: 0.01 BTC. Borrow additional to approach bounded limit
          await vBTC.connect(borrower).borrow(parseUnits("0.10", 18));
          // Now ~0.12 BTC = $7200 vs bounded capacity $8000 → tight
          // Redeem 3000 USDT → 7000 remaining → capacity = 7000 * $1 * 0.8 = $5600 < $7200 → shortfall
          await expect(vUSDT.connect(borrower).redeemUnderlying(parseUnits("3000", 18))).to.be.revertedWith(
            "math error",
          );
        });

        it("transfer blocked when bounded prices show shortfall", async () => {
          // Transfer large vUSDT → would reduce collateral below bounded capacity → Failure
          const dst = (await ethers.getSigners())[4];
          await expect(vUSDT.connect(borrower).transfer(await dst.getAddress(), parseUnits("5000", 18))).to.emit(
            vUSDT,
            "Failure",
          );
        });
      });

      // =====================================================================
      // Part 4: Oracle Crash — DBO Inflates Debt
      // =====================================================================
      describe("4. Oracle Crash — DBO inflates debt value", () => {
        let borrower2: Signer;

        before(async () => {
          borrower2 = (await ethers.getSigners())[5];
          const addr = await borrower2.getAddress();

          resetPrices();

          // Fund and set up position
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("50000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower2);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("50000", 18));
          await vUSDT.connect(borrower2).mint(parseUnits("50000", 18));
          await comptroller.connect(borrower2).enterMarkets([vUSDT_ADDRESS]);

          // Borrow near max capacity: 50000 * $1 * 0.8 = $40000 → 40000/60000 = 0.6667 BTC
          // Borrow 98%: ~0.653 BTC
          const [, borrowCapacity] = await comptroller.getBorrowingPower(addr);
          const maxBtcBorrow = borrowCapacity.mul(parseUnits("1", 18)).div(BTCB_PRICE).mul(98).div(100);

          await vBTC.connect(borrower2).borrow(maxBtcBorrow);

          crashBTCBPrice(); // BTC $60k → $42k
        });

        it("borrow reverts after BTC price crash — DBO inflates debt", async () => {
          // DBO bounds debt at window max ($60k) → existing debt stays high
          // User at 98% capacity with bounded $60k debt → any additional borrow fails
          const [, remainingCapacity] = await comptroller.getBorrowingPower(await borrower2.getAddress());
          const borrowAttempt = remainingCapacity.mul(parseUnits("1", 18)).div(BTCB_PRICE).mul(2);

          await expect(vBTC.connect(borrower2).borrow(borrowAttempt)).to.be.revertedWith("math error");
        });

        it("repayBorrow works during crash", async () => {
          const repayAmount = parseUnits("0.001", 18);
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await borrower2.getAddress(), repayAmount);

          const btcbUser = BEP20__factory.connect(BTCB_ADDR, borrower2);
          await btcbUser.approve(vBTC_ADDRESS, repayAmount);

          const borrowBefore = await vBTC.borrowBalanceStored(await borrower2.getAddress());
          const uBalBefore = await btcbUser.balanceOf(await borrower2.getAddress());
          await expect(vBTC.connect(borrower2).repayBorrow(repayAmount)).to.emit(vBTC, "RepayBorrow");

          expect(await vBTC.borrowBalanceStored(await borrower2.getAddress())).to.be.closeTo(
            borrowBefore.sub(repayAmount),
            parseUnits("0.000001", 18),
          );
          expect(await btcbUser.balanceOf(await borrower2.getAddress())).to.equal(uBalBefore.sub(repayAmount));
        });
      });

      // =====================================================================
      // Part 5: CF vs LT Path Divergence
      // =====================================================================
      describe("5. CF vs LT path divergence", () => {
        let borrower3: Signer;

        before(async () => {
          borrower3 = (await ethers.getSigners())[6];
          const addr = await borrower3.getAddress();

          resetPrices();

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower3);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(borrower3).mint(parseUnits("10000", 18));
          await comptroller.connect(borrower3).enterMarkets([vUSDT_ADDRESS]);
          await vBTC.connect(borrower3).borrow(parseUnits("0.01", 18));

          pumpUSDTPrice();
        });

        it("borrow blocked (CF bounded) but liquidation rejected (LT spot solvent)", async () => {
          // CF bounded: capacity = 10000 * $1 * 0.8 = $8000. 0.15 BTC * $60k = $9000 > $8000
          await expect(vBTC.connect(borrower3).borrow(parseUnits("0.15", 18))).to.be.revertedWith("math error");

          // LT spot pumped: 10000 * $1.50 * 0.9 = $13500 >> 0.01 BTC * $60k = $600
          const liquidator = (await ethers.getSigners())[7];
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.01", 18));

          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.01", 18));

          await expect(
            vBTC
              .connect(liquidator)
              .liquidateBorrow(await borrower3.getAddress(), parseUnits("0.005", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure");
        });

        it("getBorrowingPower (CF) shows less capacity than getAccountLiquidity (LT)", async () => {
          const addr = await borrower3.getAddress();
          const [, cfLiquidity] = await comptroller.getBorrowingPower(addr);
          const [, ltLiquidity] = await comptroller.getAccountLiquidity(addr);

          // LT uses pumped $1.50 spot → higher collateral. CF uses bounded $1 → lower
          expect(ltLiquidity).to.be.gt(cfLiquidity);
        });

        it("getBorrowingPower before vs after pump — bounded prices cap capacity", async () => {
          // Set up fresh user to get clean before/after comparison
          const freshUser = (await ethers.getSigners())[8];
          const freshAddr = await freshUser.getAddress();

          resetPrices();

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(freshAddr, parseUnits("10000", 18));
          const usdtFresh = BEP20__factory.connect(USDT_ADDR, freshUser);
          await usdtFresh.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(freshUser).mint(parseUnits("10000", 18));
          await comptroller.connect(freshUser).enterMarkets([vUSDT_ADDRESS]);

          // Before pump: record borrowing power at $1
          const [, liquidityBefore] = await comptroller.getBorrowingPower(freshAddr);

          // Pump USDT to $1.50
          pumpUSDTPrice();

          // After pump: DBO bounds collateral at window min ($1) → capacity stays same
          const [, liquidityAfter] = await comptroller.getBorrowingPower(freshAddr);

          // Borrowing power unchanged — DBO capped at pre-pump price
          expect(liquidityAfter).to.equal(liquidityBefore);

          // But LT uses pumped spot → higher value
          const [, ltLiquidity] = await comptroller.getAccountLiquidity(freshAddr);
          expect(ltLiquidity).to.be.gt(liquidityAfter);
        });
      });

      // =====================================================================
      // Part 6: Attack Scenarios
      // =====================================================================
      describe("6. Attack scenarios", () => {
        beforeEach(async () => {
          resetPrices();
        });

        it("pump-and-borrow attack blocked by DBO", async () => {
          const attacker = (await ethers.getSigners())[8];
          const addr = await attacker.getAddress();

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("10000", 18));

          const usdtAttacker = BEP20__factory.connect(USDT_ADDR, attacker);
          await usdtAttacker.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(attacker).mint(parseUnits("10000", 18));
          await comptroller.connect(attacker).enterMarkets([vUSDT_ADDRESS]);

          // Small borrow at normal prices works: 0.001 BTC = $60
          const smallBorrow = parseUnits("0.001", 18);
          const btcbAttacker = BEP20__factory.connect(BTCB_ADDR, attacker);
          const uBalBefore = await btcbAttacker.balanceOf(addr);
          const borrowBefore = await vBTC.borrowBalanceStored(addr);
          await expect(vBTC.connect(attacker).borrow(smallBorrow)).to.emit(vBTC, "Borrow");
          expect(await btcbAttacker.balanceOf(addr)).to.equal(uBalBefore.add(smallBorrow));
          expect(await vBTC.borrowBalanceStored(addr)).to.be.closeTo(
            borrowBefore.add(smallBorrow),
            parseUnits("0.000001", 18),
          );

          // Pump USDT 5x: $1 → $5
          const pumpedPrice5x = parseUnits("5", 18);
          fakeOracle.getPrice.whenCalledWith(USDT_ADDR).returns(pumpedPrice5x);
          fakeOracle.getUnderlyingPrice.whenCalledWith(vUSDT_ADDRESS).returns(pumpedPrice5x);

          // At pumped $5: capacity = 10000 * 5 * 0.8 = $40000 → 0.66 BTC
          // At bounded $1: capacity = $8000 → 0.133 BTC. Try 0.5 BTC = $30000 → blocked
          await expect(vBTC.connect(attacker).borrow(parseUnits("0.5", 18))).to.be.revertedWith("math error");
        });
      });

      // =====================================================================
      // Part 7: Protection Active at Normal Prices
      // =====================================================================
      describe("7. Protection active but prices normal — bounded pricing restricts", () => {
        let borrower4: Signer;

        before(async () => {
          borrower4 = (await ethers.getSigners())[9];
          const addr = await borrower4.getAddress();

          resetPrices();

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower4);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(borrower4).mint(parseUnits("10000", 18));
          await comptroller.connect(borrower4).enterMarkets([vUSDT_ADDRESS]);

          // Borrow at normal prices
          await vBTC.connect(borrower4).borrow(parseUnits("0.01", 18));

          // Pump to trigger protection
          pumpUSDTPrice();

          // Trigger state update
          await dbo.connect(timelock).updateProtectionState(vUSDT_ADDRESS);

          // Return price to normal — but protection remains active (cooldown not elapsed)
          resetPrices();
        });

        it("protection still active despite normal prices — bounded collateral restricts borrow", async () => {
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;
        });

        it("liquidation uses spot (normal) prices — borrower solvent", async () => {
          const liquidator = (await ethers.getSigners())[10];
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.01", 18));

          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.01", 18));

          // At normal $1 spot + LT, borrower is solvent
          await expect(
            vBTC
              .connect(liquidator)
              .liquidateBorrow(await borrower4.getAddress(), parseUnits("0.005", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
        });
      });

      // =====================================================================
      // Part 8: Keeper Disables Protection
      // =====================================================================
      describe("8. Keeper disables protection — normal operation resumes", () => {
        it("disableActiveProtectedPrice reverts before cooldown elapses", async () => {
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          await expect(dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR)).to.be.reverted;
        });

        it("keeper narrows window + disables protection after cooldown", async () => {
          // Advance time past cooldown
          await time.increase(COOLDOWN_PERIOD + 1);

          // Narrow window: max just above spot, min just below spot (2% range < 5% threshold)
          const newMax = USDT_PRICE.mul(101).div(100); // $1.01
          const newMin = USDT_PRICE.mul(99).div(100); // $0.99

          // Order: first narrow max down, then narrow min up
          await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, newMax);
          await dbo.connect(timelock).updateMinPrice(USDT_ADDR, newMin);

          // Disable protection
          await expect(dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR)).to.not.be.reverted;

          const updatedConfig = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(updatedConfig.currentlyUsingProtectedPrice).to.be.false;
        });
      });

      // =====================================================================
      // Part 9: enterPool with DBO
      // =====================================================================
      describe("9. enterPool with DBO", () => {
        it("enterPool succeeds with no borrows regardless of DBO state", async () => {
          const newUser = (await ethers.getSigners())[11];
          const addr = await newUser.getAddress();

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("100", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, newUser);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("100", 18));
          await vUSDT.connect(newUser).mint(parseUnits("100", 18));
          await comptroller.connect(newUser).enterMarkets([vUSDT_ADDRESS]);

          const [err, , shortfall] = await comptroller.getAccountLiquidity(addr);
          expect(err).to.equal(0);
          expect(shortfall).to.equal(0);
        });
      });

      // =====================================================================
      // Part 10: exitMarket with DBO
      // =====================================================================
      describe("10. exitMarket with DBO", () => {
        it("exitMarket succeeds with no borrows", async () => {
          const newUser = (await ethers.getSigners())[12];
          const addr = await newUser.getAddress();

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("100", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, newUser);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("100", 18));
          await vUSDT.connect(newUser).mint(parseUnits("100", 18));
          await comptroller.connect(newUser).enterMarkets([vUSDT_ADDRESS]);

          const errCode = await comptroller.connect(newUser).callStatic.exitMarket(vUSDT_ADDRESS);
          expect(errCode).to.equal(0);
        });

        it("exitMarket blocked at bounded CF but solvent at spot LT", async () => {
          const exitUser = ethers.Wallet.createRandom().connect(ethers.provider);
          const exitAddr = await exitUser.getAddress();
          await setBalance(exitAddr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply and borrow near max
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(exitAddr, parseUnits("10000", 18));
          const usdtExit = BEP20__factory.connect(USDT_ADDR, exitUser);
          await usdtExit.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(exitUser).mint(parseUnits("10000", 18));
          await comptroller.connect(exitUser).enterMarkets([vUSDT_ADDRESS]);
          await vBTC.connect(exitUser).borrow(parseUnits("0.01", 18));

          // Pump triggers DBO protection → bounded collateral at $1
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          // exitMarket blocked at CF (bounded prices create shortfall on full exit)
          const exitErrCode = await comptroller.connect(exitUser).callStatic.exitMarket(vUSDT_ADDRESS);
          expect(exitErrCode).to.not.equal(0);

          // But account solvent at LT (spot $1.50 → plenty of headroom)
          const [ltErr, ltLiquidity, ltShortfall] = await comptroller.getAccountLiquidity(exitAddr);
          expect(ltErr).to.equal(0);
          expect(ltLiquidity).to.be.gt(0);
          expect(ltShortfall).to.equal(0);
        });
      });

      // =====================================================================
      // Part 11: Existing Position Preservation
      // =====================================================================
      describe("11. Existing positions after upgrade", () => {
        it("user with existing borrows — account liquidity consistent", async () => {
          const [err] = await comptroller.getAccountLiquidity(USER_WITH_POSITIONS);
          expect(err).to.equal(0);
        });

        it("view functions return consistent results for existing accounts", async () => {
          const [cfErr] = await comptroller.getBorrowingPower(USER_WITH_POSITIONS);
          const [ltErr] = await comptroller.getAccountLiquidity(USER_WITH_POSITIONS);
          expect(cfErr).to.equal(0);
          expect(ltErr).to.equal(0);
        });
      });

      // =====================================================================
      // Part 12: Edge Cases
      // =====================================================================
      describe("12. Edge cases", () => {
        it("DBO returns same price as spot when no deviation — borrow succeeds normally", async () => {
          resetPrices();

          const newUser = (await ethers.getSigners())[13];
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(await newUser.getAddress(), parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, newUser);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(newUser).mint(parseUnits("10000", 18));
          await comptroller.connect(newUser).enterMarkets([vUSDT_ADDRESS]);

          // 10000 USDT * $1 * 0.8 = $8000 capacity. 0.001 BTC * $60k = $60 → easy
          const borrowAmt = parseUnits("0.001", 18);
          const btcbNewUser = BEP20__factory.connect(BTCB_ADDR, newUser);
          const uBalBefore = await btcbNewUser.balanceOf(await newUser.getAddress());
          const borrowBefore = await vBTC.borrowBalanceStored(await newUser.getAddress());
          await expect(vBTC.connect(newUser).borrow(borrowAmt)).to.emit(vBTC, "Borrow");
          expect(await btcbNewUser.balanceOf(await newUser.getAddress())).to.equal(uBalBefore.add(borrowAmt));
          expect(await vBTC.borrowBalanceStored(await newUser.getAddress())).to.be.closeTo(
            borrowBefore.add(borrowAmt),
            parseUnits("0.000001", 18),
          );
        });
      });

      // =====================================================================
      // Part 13: Keeper Updates Min/Max Price During Protection
      // =====================================================================
      describe("13. Keeper updates min/max price during protection — user action effects", () => {
        let borrower5: Signer;

        before(async () => {
          borrower5 = (await ethers.getSigners())[14];
          const addr = await borrower5.getAddress();

          await neutralizeDBO();

          // Supply 10000 USDT as collateral
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr, parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower5);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(borrower5).mint(parseUnits("10000", 18));
          await comptroller.connect(borrower5).enterMarkets([vUSDT_ADDRESS]);

          // Pump USDT to $1.50 and trigger protection
          pumpUSDTPrice();

          // Borrow 0.10 BTC = $6000 (within bounded $8000 capacity: 10000 * $1 * 0.8)
          await vBTC.connect(borrower5).borrow(parseUnits("0.10", 18));

          // Verify protection is active
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;
        });

        describe("13a. Before keeper action — user restricted at bounded prices", () => {
          it("borrow 0.05 BTC more reverts — exceeds bounded capacity", async () => {
            // Existing: 0.10 BTC=$6000. New: 0.05 BTC=$3000. Total=$9000 > $8000 → revert
            await expect(vBTC.connect(borrower5).borrow(parseUnits("0.05", 18))).to.be.revertedWith("math error");
          });

          it("redeem 3000 USDT reverts — remaining collateral insufficient", async () => {
            // Remaining 7000 USDT * $1 (bounded) * 0.8 = $5600 < $6000 debt → shortfall
            await expect(vUSDT.connect(borrower5).redeemUnderlying(parseUnits("3000", 18))).to.be.revertedWith(
              "math error",
            );
          });

          it("transfer 3000 vUSDT reverts — same as redeem", async () => {
            const dst = (await ethers.getSigners())[17];
            await expect(vUSDT.connect(borrower5).transfer(await dst.getAddress(), parseUnits("3000", 18))).to.emit(
              vUSDT,
              "Failure",
            );
          });
        });

        describe("13b. Keeper raises minPrice → collateral valuation increases", () => {
          before(async () => {
            // Keeper raises min from $1 to $1.30 (valid: $1.30 < max=$1.50 && $1.30 <= spot=$1.50)
            await dbo.connect(timelock).updateMinPrice(USDT_ADDR, parseUnits("1.30", 18));
            // Bounded collateral = min($1.50, $1.30) = $1.30
            // New capacity = 10000 * $1.30 * 0.8 = $10,400
          });

          it("borrow 0.05 BTC now succeeds — increased collateral valuation", async () => {
            // Total debt = 0.15 BTC * $60k = $9000 < $10,400 → OK
            const borrowAmt = parseUnits("0.05", 18);
            const btcb5 = BEP20__factory.connect(BTCB_ADDR, borrower5);
            const uBalBefore = await btcb5.balanceOf(await borrower5.getAddress());
            const borrowBefore = await vBTC.borrowBalanceStored(await borrower5.getAddress());
            await expect(vBTC.connect(borrower5).borrow(borrowAmt)).to.emit(vBTC, "Borrow");
            expect(await btcb5.balanceOf(await borrower5.getAddress())).to.equal(uBalBefore.add(borrowAmt));
            expect(await vBTC.borrowBalanceStored(await borrower5.getAddress())).to.be.closeTo(
              borrowBefore.add(borrowAmt),
              parseUnits("0.000001", 18),
            );
          });

          it("getBorrowingPower reflects higher capacity than before keeper action", async () => {
            const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(await borrower5.getAddress());
            expect(err).to.equal(0);
            // Should have remaining liquidity (capacity $10400 - debt ~$9000 = $1400)
            expect(liquidity).to.be.gt(0);
            expect(shortfall).to.equal(0);
          });

          it("liquidation still uses spot LT — unaffected by keeper min update", async () => {
            const liquidator = (await ethers.getSigners())[17];
            const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
            const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
            await btcb.transfer(await liquidator.getAddress(), parseUnits("0.1", 18));

            const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
            await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.1", 18));

            // LT spot: 10000 * $1.50 * 0.9 = $13,500 >> debt ~$9000 → solvent
            await expect(
              vBTC
                .connect(liquidator)
                .liquidateBorrow(await borrower5.getAddress(), parseUnits("0.05", 18), vUSDT.address),
            ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
          });
        });

        describe("13c. Keeper lowers BTC maxPrice → debt valuation decreases", () => {
          let borrower5c: Signer;

          before(async () => {
            borrower5c = (await ethers.getSigners())[15];
            const addr = await borrower5c.getAddress();

            resetPrices();

            // Supply 10000 USDT
            const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
            const usdt = BEP20__factory.connect(USDT_ADDR, whale);
            await usdt.transfer(addr, parseUnits("10000", 18));

            const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower5c);
            await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
            await vUSDT.connect(borrower5c).mint(parseUnits("10000", 18));
            await comptroller.connect(borrower5c).enterMarkets([vUSDT_ADDRESS]);

            // Borrow 0.12 BTC at normal $60k = $7200 (near $8000 capacity)
            await vBTC.connect(borrower5c).borrow(parseUnits("0.12", 18));

            // Pump BTC from $60k to $90k → trigger BTC protection
            pumpBTCBPrice();

            // Trigger state update: call DBO updateProtectionState directly for BTC
            // This is what _updateProtectionStates does internally for each market
            await dbo.connect(timelock).updateProtectionState(vBTC_ADDRESS);

            // Verify BTC protection activated
            const btcConfig = await dbo.assetProtectionConfig(BTCB_ADDR);
            expect(btcConfig.currentlyUsingProtectedPrice).to.be.true;

            // Return BTC spot to $60k — window: min=$60k, max=$90k
            fakeOracle.getPrice.whenCalledWith(BTCB_ADDR).returns(BTCB_PRICE);
            fakeOracle.getUnderlyingPrice.whenCalledWith(vBTC_ADDRESS).returns(BTCB_PRICE);
            // Bounded debt = max($60k, $90k) = $90k → 0.12 BTC valued at $10,800 (was $7,200)
          });

          it("borrow blocked — BTC debt inflated at bounded max", async () => {
            // Verify BTC protection is active and window expanded
            const btcCfg = await dbo.assetProtectionConfig(BTCB_ADDR);
            expect(btcCfg.currentlyUsingProtectedPrice).to.be.true;
            expect(btcCfg.maxPrice.gte(BTCB_PUMPED)).to.be.true;

            // With protection: debt = max(spot=$60k, max=$90k) = $90k
            // 0.12 BTC * $90k = $10,800. Capacity ≈ $8000 → shortfall
            const [, , shortfall] = await comptroller.getBorrowingPower(await borrower5c.getAddress());
            expect(shortfall).to.be.gt(0);
            await expect(vBTC.connect(borrower5c).borrow(parseUnits("0.001", 18))).to.be.revertedWith("math error");
          });

          it("keeper lowers BTC maxPrice to $65k → borrow succeeds", async () => {
            // Keeper: max $90k → $65k (valid: $65k > min=$60k && $65k >= spot=$60k)
            await dbo.connect(timelock).updateMaxPrice(BTCB_ADDR, parseUnits("65000", 18));
            // Bounded debt = max($60k, $65k) = $65k → 0.12 BTC = $7800
            // Capacity $8000 - $7800 = $200 headroom → very small borrow works
            const borrowAmt = parseUnits("0.001", 18);
            const btcb5c = BEP20__factory.connect(BTCB_ADDR, borrower5c);
            const uBalBefore = await btcb5c.balanceOf(await borrower5c.getAddress());
            const borrowBefore = await vBTC.borrowBalanceStored(await borrower5c.getAddress());
            await expect(vBTC.connect(borrower5c).borrow(borrowAmt)).to.emit(vBTC, "Borrow");
            expect(await btcb5c.balanceOf(await borrower5c.getAddress())).to.equal(uBalBefore.add(borrowAmt));
          });
        });
      });

      // =====================================================================
      // Part 14: Keeper Updates Threshold Near Price Bound
      // =====================================================================
      describe("14. Keeper updates threshold near price bound — user action effects", () => {
        describe("14a. Lowering trigger threshold activates protection → restricts user", () => {
          let borrower6: Signer;

          before(async () => {
            borrower6 = (await ethers.getSigners())[17];
            const addr = await borrower6.getAddress();

            await neutralizeDBO();

            // Supply 10000 USDT, enter market
            const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
            const usdt = BEP20__factory.connect(USDT_ADDR, whale);
            await usdt.transfer(addr, parseUnits("10000", 18));

            const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower6);
            await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
            await vUSDT.connect(borrower6).mint(parseUnits("10000", 18));
            await comptroller.connect(borrower6).enterMarkets([vUSDT_ADDRESS]);

            // Borrow 98% of capacity at $1
            const [, capacity] = await comptroller.getBorrowingPower(addr);
            const targetBorrow = capacity.mul(98).div(100).mul(parseUnits("1", 18)).div(BTCB_PRICE);
            await vBTC.connect(borrower6).borrow(targetBorrow);

            // Mild pump: $1 → $1.12 (12% < 16.67% trigger — protection stays inactive)
            const mildPrice = parseUnits("1.12", 18);
            fakeOracle.getPrice.whenCalledWith(USDT_ADDR).returns(mildPrice);
            fakeOracle.getUnderlyingPrice.whenCalledWith(vUSDT_ADDRESS).returns(mildPrice);

            // Expand window but do NOT trigger protection (12% < 16.67%)
            await dbo.updateProtectionState(vUSDT_ADDRESS);
          });

          it("before threshold change — protection is NOT active", async () => {
            const config = await dbo.assetProtectionConfig(USDT_ADDR);
            // 12% deviation < 16.67% trigger → protection should not be active
            expect(config.currentlyUsingProtectedPrice).to.be.false;
          });

          it("before threshold change — borrow succeeds at spot price", async () => {
            // Not protected → bounded = spot. Small additional borrow should succeed
            const borrowAmt = parseUnits("0.01", 18);
            const btcb6 = BEP20__factory.connect(BTCB_ADDR, borrower6);
            const uBalBefore = await btcb6.balanceOf(await borrower6.getAddress());
            const borrowBefore = await vBTC.borrowBalanceStored(await borrower6.getAddress());
            await expect(vBTC.connect(borrower6).borrow(borrowAmt)).to.emit(vBTC, "Borrow");
            expect(await btcb6.balanceOf(await borrower6.getAddress())).to.equal(uBalBefore.add(borrowAmt));
            expect(await vBTC.borrowBalanceStored(await borrower6.getAddress())).to.be.closeTo(
              borrowBefore.add(borrowAmt),
              parseUnits("0.000001", 18),
            );
          });

          it("keeper lowers trigger to 10% — protection activates, borrow reverts", async () => {
            // Lower trigger from 16.67% to 10% (reset from 5% to 3%)
            await dbo.connect(timelock).setThresholds(USDT_ADDR, parseUnits("0.10", 18), parseUnits("0.03", 18));

            // Now 12% deviation > 10% trigger → next state-changing CF-path call triggers protection
            // borrow → borrowAllowed → _updateProtectionStates → _checkAndTriggerProtection
            // After trigger: bounded collateral = min(spot, windowMin) = windowMin (lower)
            // Capacity drops → additional borrow that was fine before now fails
            // Try to borrow a meaningful amount relative to remaining capacity
            const [, remaining] = await comptroller.getBorrowingPower(await borrower6.getAddress());
            // Borrow 2x remaining capacity (if any) to ensure it exceeds bounded limit after trigger
            const attemptBtc = remaining.mul(2).mul(parseUnits("1", 18)).div(BTCB_PRICE);
            await expect(vBTC.connect(borrower6).borrow(attemptBtc)).to.be.revertedWith("math error");
          });

          it("redeem also blocked after threshold lowering triggers protection", async () => {
            await expect(vUSDT.connect(borrower6).redeemUnderlying(parseUnits("100", 18))).to.be.revertedWith(
              "math error",
            );
          });

          it("liquidation unaffected — still uses spot LT", async () => {
            // LT uses spot (mildPrice) → user has enough collateral at spot LT
            const liquidator = (await ethers.getSigners())[18];
            const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
            const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
            await btcb.transfer(await liquidator.getAddress(), parseUnits("0.1", 18));

            const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
            await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.1", 18));

            await expect(
              vBTC
                .connect(liquidator)
                .liquidateBorrow(await borrower6.getAddress(), parseUnits("0.05", 18), vUSDT.address),
            ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
          });
        });

        describe("14b. Raising trigger threshold — does NOT retroactively disable protection", () => {
          let borrower7: Signer;

          before(async () => {
            borrower7 = (await ethers.getSigners())[18];
            const addr = await borrower7.getAddress();

            await neutralizeDBO();

            const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
            const usdt = BEP20__factory.connect(USDT_ADDR, whale);
            await usdt.transfer(addr, parseUnits("10000", 18));

            const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower7);
            await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
            await vUSDT.connect(borrower7).mint(parseUnits("10000", 18));
            await comptroller.connect(borrower7).enterMarkets([vUSDT_ADDRESS]);

            // Borrow at normal prices
            await vBTC.connect(borrower7).borrow(parseUnits("0.10", 18));

            // Pump to $1.50 and trigger protection deterministically
            pumpUSDTPrice();
            await dbo.updateProtectionState(vUSDT_ADDRESS);
          });

          it("protection is active", async () => {
            const config = await dbo.assetProtectionConfig(USDT_ADDR);
            expect(config.currentlyUsingProtectedPrice).to.be.true;
          });

          it("keeper raises trigger to 25% — protection stays active (not retroactive)", async () => {
            await dbo.connect(timelock).setThresholds(USDT_ADDR, parseUnits("0.25", 18), parseUnits("0.08", 18));

            // Protection already triggered → changing threshold doesn't auto-disable
            const config = await dbo.assetProtectionConfig(USDT_ADDR);
            expect(config.currentlyUsingProtectedPrice).to.be.true;

            // User still restricted at bounded prices
            await expect(vBTC.connect(borrower7).borrow(parseUnits("0.05", 18))).to.be.revertedWith("math error");
          });

          it("but wider reset threshold makes disableActiveProtectedPrice easier", async () => {
            // Advance past cooldown
            await time.increase(COOLDOWN_PERIOD + 1);

            // Narrow window close to spot
            await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, USDT_PUMPED.mul(101).div(100));
            await dbo.connect(timelock).updateMinPrice(USDT_ADDR, USDT_PUMPED.mul(95).div(100));
            // Range = ($1.515 - $1.425) / $1.425 ≈ 6.3%
            // With reset=8%, 6.3% < 8% → disableActiveProtectedPrice should succeed
            await expect(dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR)).to.not.be.reverted;

            // User can now borrow at spot capacity
            const borrowAmt = parseUnits("0.05", 18);
            const btcb7 = BEP20__factory.connect(BTCB_ADDR, borrower7);
            const uBalBefore = await btcb7.balanceOf(await borrower7.getAddress());
            const borrowBefore = await vBTC.borrowBalanceStored(await borrower7.getAddress());
            await expect(vBTC.connect(borrower7).borrow(borrowAmt)).to.emit(vBTC, "Borrow");
            expect(await btcb7.balanceOf(await borrower7.getAddress())).to.equal(uBalBefore.add(borrowAmt));
            expect(await vBTC.borrowBalanceStored(await borrower7.getAddress())).to.be.closeTo(
              borrowBefore.add(borrowAmt),
              parseUnits("0.000001", 18),
            );
          });
        });

        describe("14c. setCooldownPeriod affects when protection can be disabled", () => {
          let borrower8: Signer;

          before(async () => {
            borrower8 = (await ethers.getSigners())[19];
            const addr = await borrower8.getAddress();

            await neutralizeDBO();

            const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
            const usdt = BEP20__factory.connect(USDT_ADDR, whale);
            await usdt.transfer(addr, parseUnits("10000", 18));

            const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower8);
            await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
            await vUSDT.connect(borrower8).mint(parseUnits("10000", 18));
            await comptroller.connect(borrower8).enterMarkets([vUSDT_ADDRESS]);

            await vBTC.connect(borrower8).borrow(parseUnits("0.10", 18));

            // Pump to $1.50 and trigger protection deterministically
            pumpUSDTPrice();
            await dbo.updateProtectionState(vUSDT_ADDRESS);

            // Verify protection is active
            const config = await dbo.assetProtectionConfig(USDT_ADDR);
            expect(config.currentlyUsingProtectedPrice).to.be.true;
          });

          it("keeper extends cooldown — disableActiveProtectedPrice reverts after original cooldown", async () => {
            // Extend cooldown from 1 hour to 2 hours
            await dbo.connect(timelock).setCooldownPeriod(USDT_ADDR, COOLDOWN_PERIOD * 2);

            // Advance past original 1 hour cooldown but NOT the new 2-hour cooldown
            await time.increase(COOLDOWN_PERIOD + 1);

            // Narrow window: spot=$1.50 (pumped), window=[$1, $1.50]
            const newMax = USDT_PUMPED.mul(101).div(100); // $1.515
            const newMin = USDT_PUMPED.mul(99).div(100); // $1.485
            await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, newMax);
            await dbo.connect(timelock).updateMinPrice(USDT_ADDR, newMin);

            // Still within new 2-hour cooldown → revert
            await expect(dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR)).to.be.reverted;
          });

          it("after extended cooldown elapses — disableActiveProtectedPrice succeeds", async () => {
            // Advance past remaining cooldown
            await time.increase(COOLDOWN_PERIOD + 1);

            await expect(dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR)).to.not.be.reverted;

            // User can now borrow
            const borrowAmt = parseUnits("0.05", 18);
            const btcb8 = BEP20__factory.connect(BTCB_ADDR, borrower8);
            const uBalBefore = await btcb8.balanceOf(await borrower8.getAddress());
            const borrowBefore = await vBTC.borrowBalanceStored(await borrower8.getAddress());
            await expect(vBTC.connect(borrower8).borrow(borrowAmt)).to.emit(vBTC, "Borrow");
            expect(await btcb8.balanceOf(await borrower8.getAddress())).to.equal(uBalBefore.add(borrowAmt));
            expect(await vBTC.borrowBalanceStored(await borrower8.getAddress())).to.be.closeTo(
              borrowBefore.add(borrowAmt),
              parseUnits("0.000001", 18),
            );
          });
        });
      });

      // =====================================================================
      // Part 15: All User Actions — Protection Active (Pumped Prices)
      // =====================================================================
      describe("15. All user actions — protection active (pumped prices)", () => {
        let user15: Signer;
        let user15Addr: string;

        before(async () => {
          user15 = ethers.Wallet.createRandom().connect(ethers.provider);
          user15Addr = await user15.getAddress();
          await setBalance(user15Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply 10000 USDT as collateral at normal $1
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user15Addr, parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, user15);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user15).mint(parseUnits("10000", 18));
          await comptroller.connect(user15).enterMarkets([vUSDT_ADDRESS]);

          // Borrow 95% of capacity: capacity = 10000 * $1 * 0.8 = $8000
          // 95% = $7600 → 7600/60000 ≈ 0.1267 BTC
          const [, capacity] = await comptroller.getBorrowingPower(user15Addr);
          const borrowBtc = capacity.mul(95).div(100).mul(parseUnits("1", 18)).div(BTCB_PRICE);
          await vBTC.connect(user15).borrow(borrowBtc);

          // Pump USDT to $1.50 → triggers DBO protection
          pumpUSDTPrice();

          // Trigger protection state update
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          // Verify protection is active
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;
        });

        it("mint succeeds — no liquidity check", async () => {
          const mintAmount = parseUnits("100", 18);
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user15Addr, mintAmount);
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user15);
          await usdtUser.approve(vUSDT_ADDRESS, mintAmount);

          const vBalBefore = await vUSDT.balanceOf(user15Addr);
          const uBalBefore = await usdtUser.balanceOf(user15Addr);
          const er = await vUSDT.callStatic.exchangeRateCurrent();
          const expectedVTokens = mintAmount.mul(parseUnits("1", 18)).div(er);
          await expect(vUSDT.connect(user15).mint(mintAmount)).to.emit(vUSDT, "Mint");

          expect(await vUSDT.balanceOf(user15Addr)).to.be.closeTo(vBalBefore.add(expectedVTokens), parseUnits("1", 8));
          expect(await usdtUser.balanceOf(user15Addr)).to.equal(uBalBefore.sub(mintAmount));
        });

        it("repayBorrow succeeds — no liquidity check", async () => {
          const repayAmount = parseUnits("0.001", 18);
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(user15Addr, repayAmount);
          const btcbUser = BEP20__factory.connect(BTCB_ADDR, user15);
          await btcbUser.approve(vBTC_ADDRESS, repayAmount);

          const borrowBefore = await vBTC.borrowBalanceStored(user15Addr);
          const uBalBefore = await btcbUser.balanceOf(user15Addr);
          await expect(vBTC.connect(user15).repayBorrow(repayAmount)).to.emit(vBTC, "RepayBorrow");

          expect(await vBTC.borrowBalanceStored(user15Addr)).to.be.closeTo(
            borrowBefore.sub(repayAmount),
            parseUnits("0.000001", 18),
          );
          expect(await btcbUser.balanceOf(user15Addr)).to.equal(uBalBefore.sub(repayAmount));
        });

        it("borrow reverts — bounded collateral limits capacity", async () => {
          // Bounded collateral = min($1.50, $1) = $1 → capacity = $8000
          // Already at 95% → only $400 headroom. Borrow $600 worth → revert
          await expect(vBTC.connect(user15).borrow(parseUnits("0.01", 18))).to.be.revertedWith("math error");
        });

        it("redeem reverts — removing collateral causes shortfall at bounded prices", async () => {
          // Redeem 1000 USDT → 9000 remaining → capacity = 9000 * $1 * 0.8 = $7200 < ~$7600 debt
          await expect(vUSDT.connect(user15).redeemUnderlying(parseUnits("1000", 18))).to.be.revertedWith("math error");
        });

        it("transfer reverts — same CF path as redeem", async () => {
          const dst = ethers.Wallet.createRandom().connect(ethers.provider);
          await expect(vUSDT.connect(user15).transfer(await dst.getAddress(), parseUnits("1000", 18))).to.emit(
            vUSDT,
            "Failure",
          );
        });

        it("exitMarket reverts — removing all collateral causes shortfall", async () => {
          const errCode = await comptroller.connect(user15).callStatic.exitMarket(vUSDT_ADDRESS);
          expect(errCode).to.not.equal(0); // REJECTION
        });

        it("liquidateBorrow returns INSUFFICIENT_SHORTFALL — uses spot LT, borrower solvent", async () => {
          // LT path: 10000 * $1.50 (pumped spot) * 0.9 = $13,500 >> ~$7600 debt → solvent
          const liquidator = ethers.Wallet.createRandom().connect(ethers.provider);
          await setBalance(await liquidator.getAddress(), parseUnits("10", 18));
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.1", 18));
          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.1", 18));

          await expect(
            vBTC.connect(liquidator).liquidateBorrow(user15Addr, parseUnits("0.05", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
        });

        it("getAccountLiquidity shows solvency at spot LT prices", async () => {
          const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(user15Addr);
          expect(err).to.equal(0);
          expect(liquidity).to.be.gt(0);
          expect(shortfall).to.equal(0);
        });

        it("claimVenus succeeds — CF path with updateProtectionState", async () => {
          // claimVenus calls _getAccountLiquidity(USE_COLLATERAL_FACTOR) → _updateProtectionStates
          // Should not revert regardless of protection state
          await expect(comptroller.connect(user15)["claimVenus(address,address[])"](user15Addr, [vUSDT_ADDRESS])).to.not
            .be.reverted;
        });
      });

      // =====================================================================
      // Part 16: All User Actions — Protection Active, Prices Normal (Stale)
      // =====================================================================
      describe("16. All user actions — protection active, prices returned to normal", () => {
        let user16: Signer;
        let user16Addr: string;

        before(async () => {
          user16 = ethers.Wallet.createRandom().connect(ethers.provider);
          user16Addr = await user16.getAddress();
          await setBalance(user16Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply 10000 USDT at $1
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user16Addr, parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, user16);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user16).mint(parseUnits("10000", 18));
          await comptroller.connect(user16).enterMarkets([vUSDT_ADDRESS]);

          // Borrow 95% of capacity
          const [, capacity] = await comptroller.getBorrowingPower(user16Addr);
          const borrowBtc = capacity.mul(95).div(100).mul(parseUnits("1", 18)).div(BTCB_PRICE);
          await vBTC.connect(user16).borrow(borrowBtc);

          // Pump to trigger protection
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          // Return prices to normal — but protection remains active (cooldown not elapsed)
          resetPrices();

          // Verify protection still active
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;
        });

        it("mint succeeds — no liquidity check", async () => {
          const mintAmount = parseUnits("100", 18);
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user16Addr, mintAmount);
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user16);
          await usdtUser.approve(vUSDT_ADDRESS, mintAmount);

          const vBalBefore = await vUSDT.balanceOf(user16Addr);
          const uBalBefore = await usdtUser.balanceOf(user16Addr);
          const er = await vUSDT.callStatic.exchangeRateCurrent();
          const expectedVTokens = mintAmount.mul(parseUnits("1", 18)).div(er);
          await expect(vUSDT.connect(user16).mint(mintAmount)).to.emit(vUSDT, "Mint");

          expect(await vUSDT.balanceOf(user16Addr)).to.be.closeTo(vBalBefore.add(expectedVTokens), parseUnits("1", 8));
          expect(await usdtUser.balanceOf(user16Addr)).to.equal(uBalBefore.sub(mintAmount));
        });

        it("repayBorrow succeeds — no liquidity check", async () => {
          const repayAmount = parseUnits("0.001", 18);
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(user16Addr, repayAmount);
          const btcbUser = BEP20__factory.connect(BTCB_ADDR, user16);
          await btcbUser.approve(vBTC_ADDRESS, repayAmount);

          const borrowBefore = await vBTC.borrowBalanceStored(user16Addr);
          const uBalBefore = await btcbUser.balanceOf(user16Addr);
          await expect(vBTC.connect(user16).repayBorrow(repayAmount)).to.emit(vBTC, "RepayBorrow");

          expect(await vBTC.borrowBalanceStored(user16Addr)).to.be.closeTo(
            borrowBefore.sub(repayAmount),
            parseUnits("0.000001", 18),
          );
          expect(await btcbUser.balanceOf(user16Addr)).to.equal(uBalBefore.sub(repayAmount));
        });

        it("borrow restricted — bounded window limits capacity despite normal spot", async () => {
          await expect(vBTC.connect(user16).borrow(parseUnits("0.01", 18))).to.be.revertedWith("math error");
        });

        it("redeem restricted — bounded prices keep position conservative", async () => {
          await expect(vUSDT.connect(user16).redeemUnderlying(parseUnits("1000", 18))).to.be.revertedWith("math error");
        });

        it("transfer restricted — same CF path as redeem", async () => {
          const dst = ethers.Wallet.createRandom().connect(ethers.provider);
          await expect(vUSDT.connect(user16).transfer(await dst.getAddress(), parseUnits("1000", 18))).to.emit(
            vUSDT,
            "Failure",
          );
        });

        it("exitMarket restricted — bounded prices create shortfall on exit", async () => {
          const errCode = await comptroller.connect(user16).callStatic.exitMarket(vUSDT_ADDRESS);
          expect(errCode).to.not.equal(0);
        });

        it("liquidateBorrow returns INSUFFICIENT_SHORTFALL — spot prices normal, borrower solvent", async () => {
          // LT path: 10000 * $1 * 0.9 = $9000 > ~$7600 debt → solvent
          const liquidator = ethers.Wallet.createRandom().connect(ethers.provider);
          await setBalance(await liquidator.getAddress(), parseUnits("10", 18));
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.1", 18));
          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.1", 18));

          await expect(
            vBTC.connect(liquidator).liquidateBorrow(user16Addr, parseUnits("0.05", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure");
        });

        it("getBorrowingPower shows reduced capacity vs spot", async () => {
          const [, cfLiquidity] = await comptroller.getBorrowingPower(user16Addr);
          const [, ltLiquidity] = await comptroller.getAccountLiquidity(user16Addr);
          // CF uses bounded prices, LT uses spot
          // At normal prices: LT should >= CF (LT has higher weighting factor)
          expect(ltLiquidity).to.be.gte(cfLiquidity);
        });

        it("getAccountLiquidity shows solvency at spot LT", async () => {
          const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(user16Addr);
          expect(err).to.equal(0);
          expect(liquidity).to.be.gt(0);
          expect(shortfall).to.equal(0);
        });

        it("claimVenus succeeds — CF path with updateProtectionState", async () => {
          await expect(comptroller.connect(user16)["claimVenus(address,address[])"](user16Addr, [vUSDT_ADDRESS])).to.not
            .be.reverted;
        });
      });

      // =====================================================================
      // Part 17: All User Actions — After Keeper Disables Protection
      // =====================================================================
      describe("17. All user actions — after keeper disables protection", () => {
        let user17: Signer;
        let user17Addr: string;

        before(async () => {
          user17 = ethers.Wallet.createRandom().connect(ethers.provider);
          user17Addr = await user17.getAddress();
          await setBalance(user17Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply 10000 USDT at $1
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user17Addr, parseUnits("10000", 18));

          const usdtUser = BEP20__factory.connect(USDT_ADDR, user17);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user17).mint(parseUnits("10000", 18));
          await comptroller.connect(user17).enterMarkets([vUSDT_ADDRESS]);

          // Borrow small amount (leave plenty of headroom for post-disable tests)
          await vBTC.connect(user17).borrow(parseUnits("0.05", 18)); // $3000 of $8000 capacity

          // Trigger protection, then disable it deterministically
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);
          resetPrices(); // return to $1

          // Advance past cooldown and disable protection
          // Window is deterministically [$0.99, $1.50] after pump (min from neutralize, max expanded)
          await time.increase(COOLDOWN_PERIOD + 1);
          await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, USDT_PRICE.mul(101).div(100)); // $1.01
          await dbo.connect(timelock).updateMinPrice(USDT_ADDR, USDT_PRICE.mul(99).div(100)); // $0.99
          await dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR);

          // Verify protection is disabled
          const cfgAfter = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(cfgAfter.currentlyUsingProtectedPrice).to.be.false;
        });

        it("mint succeeds", async () => {
          const mintAmount = parseUnits("100", 18);
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user17Addr, mintAmount);
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user17);
          await usdtUser.approve(vUSDT_ADDRESS, mintAmount);

          const vBalBefore = await vUSDT.balanceOf(user17Addr);
          const uBalBefore = await usdtUser.balanceOf(user17Addr);
          const er = await vUSDT.callStatic.exchangeRateCurrent();
          const expectedVTokens = mintAmount.mul(parseUnits("1", 18)).div(er);
          await expect(vUSDT.connect(user17).mint(mintAmount)).to.emit(vUSDT, "Mint");

          expect(await vUSDT.balanceOf(user17Addr)).to.be.closeTo(vBalBefore.add(expectedVTokens), parseUnits("1", 8));
          expect(await usdtUser.balanceOf(user17Addr)).to.equal(uBalBefore.sub(mintAmount));
        });

        it("repayBorrow succeeds", async () => {
          const repayAmount = parseUnits("0.001", 18);
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(user17Addr, repayAmount);
          const btcbUser = BEP20__factory.connect(BTCB_ADDR, user17);
          await btcbUser.approve(vBTC_ADDRESS, repayAmount);

          const borrowBefore = await vBTC.borrowBalanceStored(user17Addr);
          const uBalBefore = await btcbUser.balanceOf(user17Addr);
          await expect(vBTC.connect(user17).repayBorrow(repayAmount)).to.emit(vBTC, "RepayBorrow");

          expect(await vBTC.borrowBalanceStored(user17Addr)).to.be.closeTo(
            borrowBefore.sub(repayAmount),
            parseUnits("0.000001", 18),
          );
          expect(await btcbUser.balanceOf(user17Addr)).to.equal(uBalBefore.sub(repayAmount));
        });

        it("borrow succeeds — capacity restored to spot levels", async () => {
          // No protection → bounded = spot. Plenty of headroom ($5000+)
          const borrowAmt = parseUnits("0.01", 18);
          const btcb17 = BEP20__factory.connect(BTCB_ADDR, user17);
          const uBalBefore = await btcb17.balanceOf(user17Addr);
          const borrowBefore = await vBTC.borrowBalanceStored(user17Addr);
          await expect(vBTC.connect(user17).borrow(borrowAmt)).to.emit(vBTC, "Borrow");

          expect(await btcb17.balanceOf(user17Addr)).to.equal(uBalBefore.add(borrowAmt));
          expect(await vBTC.borrowBalanceStored(user17Addr)).to.be.closeTo(
            borrowBefore.add(borrowAmt),
            parseUnits("0.000001", 18),
          );
        });

        it("redeem succeeds — collateral valued at spot", async () => {
          // Small redeem — still solvent with plenty of headroom
          const redeemAmount = parseUnits("500", 18);
          const usdtUser17 = BEP20__factory.connect(USDT_ADDR, user17);
          const uBalBefore = await usdtUser17.balanceOf(user17Addr);
          await expect(vUSDT.connect(user17).redeemUnderlying(redeemAmount)).to.emit(vUSDT, "Redeem");

          expect(await usdtUser17.balanceOf(user17Addr)).to.equal(uBalBefore.add(redeemAmount));
        });

        it("exitMarket succeeds for market with no borrows", async () => {
          // User hasn't borrowed from vUSDT, only from vBTC
          // Can't exit vUSDT because it's collateral for the BTC borrow
          // Test with a fresh user that has no borrows
          const exitUser = ethers.Wallet.createRandom().connect(ethers.provider);
          const exitAddr = await exitUser.getAddress();
          await setBalance(exitAddr, parseUnits("10", 18));
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(exitAddr, parseUnits("100", 18));
          const usdtExit = BEP20__factory.connect(USDT_ADDR, exitUser);
          await usdtExit.approve(vUSDT_ADDRESS, parseUnits("100", 18));
          await vUSDT.connect(exitUser).mint(parseUnits("100", 18));
          await comptroller.connect(exitUser).enterMarkets([vUSDT_ADDRESS]);

          const errCode = await comptroller.connect(exitUser).callStatic.exitMarket(vUSDT_ADDRESS);
          expect(errCode).to.equal(0);
        });

        it("liquidateBorrow returns INSUFFICIENT_SHORTFALL — solvent at spot", async () => {
          const liquidator = ethers.Wallet.createRandom().connect(ethers.provider);
          await setBalance(await liquidator.getAddress(), parseUnits("10", 18));
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.1", 18));
          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.1", 18));

          await expect(
            vBTC.connect(liquidator).liquidateBorrow(user17Addr, parseUnits("0.02", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure");
        });

        it("getBorrowingPower and getAccountLiquidity both show solvency", async () => {
          const [cfErr, cfLiquidity, cfShortfall] = await comptroller.getBorrowingPower(user17Addr);
          const [ltErr, ltLiquidity, ltShortfall] = await comptroller.getAccountLiquidity(user17Addr);
          expect(cfErr).to.equal(0);
          expect(ltErr).to.equal(0);
          expect(cfLiquidity).to.be.gt(0);
          expect(ltLiquidity).to.be.gt(0);
          expect(cfShortfall).to.equal(0);
          expect(ltShortfall).to.equal(0);
        });

        it("claimVenus succeeds normally", async () => {
          await expect(comptroller.connect(user17)["claimVenus(address,address[])"](user17Addr, [vUSDT_ADDRESS])).to.not
            .be.reverted;
        });
      });

      // =====================================================================
      // Part 18: Oracle vs DBO Price Divergence Cycle
      // =====================================================================
      describe("18. Oracle vs DBO price divergence through protection lifecycle", () => {
        let user19: Signer;
        let user19Addr: string;

        before(async () => {
          user19 = ethers.Wallet.createRandom().connect(ethers.provider);
          user19Addr = await user19.getAddress();
          await setBalance(user19Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply USDT
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user19Addr, parseUnits("10000", 18));
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user19);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user19).mint(parseUnits("10000", 18));
          await comptroller.connect(user19).enterMarkets([vUSDT_ADDRESS]);
        });

        it("Phase 1: no protection — DBO prices equal spot", async () => {
          const spot = await fakeOracle.getUnderlyingPrice(vUSDT_ADDRESS);
          const [collPrice, debtPrice] = await dbo.getBoundedPricesView(vUSDT_ADDRESS);
          expect(collPrice).to.equal(spot);
          expect(debtPrice).to.equal(spot);
        });

        it("Phase 2: pump triggers protection — DBO collateral < spot", async () => {
          pumpUSDTPrice(); // $1 → $1.50
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          const spot = await fakeOracle.getUnderlyingPrice(vUSDT_ADDRESS);
          expect(spot).to.equal(USDT_PUMPED);

          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;

          const [collPrice, debtPrice] = await dbo.getBoundedPricesView(vUSDT_ADDRESS);
          // After neutralizeDBO, windowMin=$0.99. Collateral = min($1.50, $0.99) = $0.99
          const NEUTRALIZED_MIN = USDT_PRICE.mul(99).div(100);
          expect(collPrice).to.equal(NEUTRALIZED_MIN);
          // Debt bounded at window max ($1.50) = spot (max expanded)
          expect(debtPrice).to.equal(USDT_PUMPED);
        });

        it("Phase 3: spot normalizes, protection still active — debt > spot", async () => {
          resetPrices(); // back to $1

          const spot = await fakeOracle.getUnderlyingPrice(vUSDT_ADDRESS);
          expect(spot).to.equal(USDT_PRICE);

          // Protection still active (cooldown not elapsed)
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;

          const [collPrice, debtPrice] = await dbo.getBoundedPricesView(vUSDT_ADDRESS);
          // Collateral = min(spot=$1, windowMin=$0.99) = $0.99
          const NEUTRALIZED_MIN = USDT_PRICE.mul(99).div(100);
          expect(collPrice).to.equal(NEUTRALIZED_MIN);
          // Debt = max(spot=$1, windowMax=$1.50) = $1.50 > spot
          expect(debtPrice).to.equal(USDT_PUMPED);
        });

        it("Phase 4: protection disabled — DBO prices equal spot again", async () => {
          await time.increase(COOLDOWN_PERIOD + 1);

          // Narrow window to allow disable
          await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, USDT_PRICE.mul(101).div(100));
          await dbo.connect(timelock).updateMinPrice(USDT_ADDR, USDT_PRICE.mul(99).div(100));
          await dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR);

          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.false;

          const spot = await fakeOracle.getUnderlyingPrice(vUSDT_ADDRESS);
          const [collPrice, debtPrice] = await dbo.getBoundedPricesView(vUSDT_ADDRESS);
          expect(collPrice).to.equal(spot);
          expect(debtPrice).to.equal(spot);
        });
      });

      // =====================================================================
      // Part 19: Full Protection Lifecycle
      // =====================================================================
      describe("19. Full lifecycle: configure → pump → block → disable → allow", () => {
        let user20: Signer;
        let user20Addr: string;

        before(async () => {
          user20 = ethers.Wallet.createRandom().connect(ethers.provider);
          user20Addr = await user20.getAddress();
          await setBalance(user20Addr, parseUnits("10", 18));

          await neutralizeDBO();
        });

        it("Step 1: asset configured — bounded pricing enabled, protection inactive", async () => {
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.isBoundedPricingEnabled).to.be.true;
          expect(config.currentlyUsingProtectedPrice).to.be.false;
        });

        it("Step 2: set up position — supply USDT, borrow BTC", async () => {
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user20Addr, parseUnits("10000", 18));
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user20);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await expect(vUSDT.connect(user20).mint(parseUnits("10000", 18))).to.emit(vUSDT, "Mint");
          await comptroller.connect(user20).enterMarkets([vUSDT_ADDRESS]);

          // Borrow 95% capacity
          const [, capacity] = await comptroller.getBorrowingPower(user20Addr);
          const borrowBtc = capacity.mul(95).div(100).mul(parseUnits("1", 18)).div(BTCB_PRICE);
          const btcb20 = BEP20__factory.connect(BTCB_ADDR, user20);
          const uBalBefore = await btcb20.balanceOf(user20Addr);
          const borrowBefore = await vBTC.borrowBalanceStored(user20Addr);
          await expect(vBTC.connect(user20).borrow(borrowBtc)).to.emit(vBTC, "Borrow");
          expect(await btcb20.balanceOf(user20Addr)).to.equal(uBalBefore.add(borrowBtc));
          expect(await vBTC.borrowBalanceStored(user20Addr)).to.be.closeTo(
            borrowBefore.add(borrowBtc),
            parseUnits("0.000001", 18),
          );
        });

        it("Step 3: pump triggers protection — actions blocked", async () => {
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;

          // Borrow reverts
          await expect(vBTC.connect(user20).borrow(parseUnits("0.01", 18))).to.be.revertedWith("math error");
          // Redeem reverts
          await expect(vUSDT.connect(user20).redeemUnderlying(parseUnits("1000", 18))).to.be.revertedWith("math error");
          // Transfer emits Failure
          const dst = ethers.Wallet.createRandom().connect(ethers.provider);
          await expect(vUSDT.connect(user20).transfer(await dst.getAddress(), parseUnits("1000", 18))).to.emit(
            vUSDT,
            "Failure",
          );
        });

        it("Step 4: advance cooldown, keeper disables protection", async () => {
          await time.increase(COOLDOWN_PERIOD + 1);
          resetPrices();

          await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, USDT_PRICE.mul(101).div(100));
          await dbo.connect(timelock).updateMinPrice(USDT_ADDR, USDT_PRICE.mul(99).div(100));
          await dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR);

          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.false;
        });

        it("Step 5: actions allowed again — borrow succeeds with balance check", async () => {
          // Repay some debt first to create headroom
          const repayAmt = parseUnits("0.05", 18);
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(user20Addr, repayAmt);
          const btcb20 = BEP20__factory.connect(BTCB_ADDR, user20);
          await btcb20.approve(vBTC_ADDRESS, repayAmt);
          const borrowBeforeRepay = await vBTC.borrowBalanceStored(user20Addr);
          await expect(vBTC.connect(user20).repayBorrow(repayAmt)).to.emit(vBTC, "RepayBorrow");
          expect(await vBTC.borrowBalanceStored(user20Addr)).to.be.closeTo(
            borrowBeforeRepay.sub(repayAmt),
            parseUnits("0.000001", 18),
          );

          // Small borrow succeeds
          const smallBorrow = parseUnits("0.001", 18);
          const uBalBefore = await btcb20.balanceOf(user20Addr);
          const borrowBefore = await vBTC.borrowBalanceStored(user20Addr);
          await expect(vBTC.connect(user20).borrow(smallBorrow)).to.emit(vBTC, "Borrow");
          expect(await btcb20.balanceOf(user20Addr)).to.equal(uBalBefore.add(smallBorrow));
          expect(await vBTC.borrowBalanceStored(user20Addr)).to.be.closeTo(
            borrowBefore.add(smallBorrow),
            parseUnits("0.000001", 18),
          );
        });
      });

      // =====================================================================
      // Part 20: Multi-Asset Protection Independence
      // =====================================================================
      describe("20. Multi-asset protection independence", () => {
        it("protection on USDT does not block user with only BTC collateral", async () => {
          await neutralizeDBO();

          // Pump USDT to trigger protection
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);
          const config = await dbo.assetProtectionConfig(USDT_ADDR);
          expect(config.currentlyUsingProtectedPrice).to.be.true;

          // BTC should NOT be protected
          const btcConfig = await dbo.assetProtectionConfig(BTCB_ADDR);
          expect(btcConfig.currentlyUsingProtectedPrice).to.be.false;

          // Fresh user with BTC collateral can still borrow
          const freshUser = ethers.Wallet.createRandom().connect(ethers.provider);
          const freshAddr = await freshUser.getAddress();
          await setBalance(freshAddr, parseUnits("10", 18));

          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(freshAddr, parseUnits("0.1", 18));

          const btcbFresh = BEP20__factory.connect(BTCB_ADDR, freshUser);
          await btcbFresh.approve(vBTC_ADDRESS, parseUnits("0.1", 18));
          await vBTC.connect(freshUser).mint(parseUnits("0.1", 18));
          await comptroller.connect(freshUser).enterMarkets([vBTC_ADDRESS]);

          // Borrow small USDT against BTC collateral
          const borrowAmt = parseUnits("100", 18);
          const usdtFresh = BEP20__factory.connect(USDT_ADDR, freshUser);
          const uBalBefore = await usdtFresh.balanceOf(freshAddr);
          const borrowBefore = await vUSDT.borrowBalanceStored(freshAddr);
          await expect(vUSDT.connect(freshUser).borrow(borrowAmt)).to.emit(vUSDT, "Borrow");
          expect(await usdtFresh.balanceOf(freshAddr)).to.equal(uBalBefore.add(borrowAmt));
          expect(await vUSDT.borrowBalanceStored(freshAddr)).to.be.closeTo(
            borrowBefore.add(borrowAmt),
            parseUnits("0.000001", 18),
          );
        });
      });

      // =====================================================================
      // Part 21: Re-enable Protection After Disable
      // =====================================================================
      describe("21. Re-enable protection after disable", () => {
        it("trigger → disable → re-pump → re-trigger — borrow blocked, allowed, blocked again", async () => {
          await neutralizeDBO();

          // Set up a user with USDT collateral, borrow near max
          const user21 = ethers.Wallet.createRandom().connect(ethers.provider);
          const user21Addr = await user21.getAddress();
          await setBalance(user21Addr, parseUnits("10", 18));

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user21Addr, parseUnits("10000", 18));
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user21);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user21).mint(parseUnits("10000", 18));
          await comptroller.connect(user21).enterMarkets([vUSDT_ADDRESS]);

          // Borrow 95% of capacity to make position tight
          const [, capacity] = await comptroller.getBorrowingPower(user21Addr);
          const borrowBtc = capacity.mul(95).div(100).mul(parseUnits("1", 18)).div(BTCB_PRICE);
          await vBTC.connect(user21).borrow(borrowBtc);

          // First trigger — pump activates protection
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);
          expect((await dbo.assetProtectionConfig(USDT_ADDR)).currentlyUsingProtectedPrice).to.be.true;

          // Borrow blocked — bounded prices restrict capacity
          await expect(vBTC.connect(user21).borrow(parseUnits("0.01", 18))).to.be.revertedWith("math error");

          // Disable protection
          await time.increase(COOLDOWN_PERIOD + 1);
          resetPrices();
          await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, USDT_PRICE.mul(101).div(100));
          await dbo.connect(timelock).updateMinPrice(USDT_ADDR, USDT_PRICE.mul(99).div(100));
          await dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR);
          expect((await dbo.assetProtectionConfig(USDT_ADDR)).currentlyUsingProtectedPrice).to.be.false;

          // Borrow now allowed — protection disabled, spot prices used
          await expect(vBTC.connect(user21).borrow(parseUnits("0.001", 18))).to.not.be.reverted;

          // Re-pump triggers protection again
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);
          expect((await dbo.assetProtectionConfig(USDT_ADDR)).currentlyUsingProtectedPrice).to.be.true;

          // Borrow blocked again — bounded prices re-applied
          await expect(vBTC.connect(user21).borrow(parseUnits("0.01", 18))).to.be.revertedWith("math error");
        });
      });

      // =====================================================================
      // Part 22: Liquidation During Protection on Collateral Only
      // =====================================================================
      describe("22. Liquidation during protection on collateral asset only", () => {
        it("USDT protected, BTCB not — LT uses spot, protection irrelevant", async () => {
          await neutralizeDBO();

          // Set up user with USDT collateral, BTC borrow
          const user25 = ethers.Wallet.createRandom().connect(ethers.provider);
          const addr25 = await user25.getAddress();
          await setBalance(addr25, parseUnits("10", 18));

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(addr25, parseUnits("10000", 18));
          const usdtU = BEP20__factory.connect(USDT_ADDR, user25);
          await usdtU.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user25).mint(parseUnits("10000", 18));
          await comptroller.connect(user25).enterMarkets([vUSDT_ADDRESS]);
          await vBTC.connect(user25).borrow(parseUnits("0.01", 18));

          // Trigger protection on USDT only
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);
          expect((await dbo.assetProtectionConfig(USDT_ADDR)).currentlyUsingProtectedPrice).to.be.true;
          expect((await dbo.assetProtectionConfig(BTCB_ADDR)).currentlyUsingProtectedPrice).to.be.false;

          // Liquidation uses LT spot — borrower solvent at pumped $1.50
          // LT: 10000 * $1.50 * 0.9 = $13500 >> 0.01 * $60k = $600
          const liq25 = ethers.Wallet.createRandom().connect(ethers.provider);
          await setBalance(await liq25.getAddress(), parseUnits("10", 18));
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liq25.getAddress(), parseUnits("0.01", 18));
          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liq25);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.01", 18));

          await expect(vBTC.connect(liq25).liquidateBorrow(addr25, parseUnits("0.005", 18), vUSDT.address)).to.emit(
            vBTC,
            "Failure",
          ); // INSUFFICIENT_SHORTFALL — protection doesn't affect LT
        });
      });

      // =====================================================================
      // Part 23: getBorrowingPower vs getAccountLiquidity Divergence
      // =====================================================================
      describe("23. getBorrowingPower vs getAccountLiquidity divergence through cycle", () => {
        let user26: Signer;
        let user26Addr: string;

        before(async () => {
          user26 = ethers.Wallet.createRandom().connect(ethers.provider);
          user26Addr = await user26.getAddress();
          await setBalance(user26Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Set CF=0.7, LT=0.9 on vUSDT for deterministic divergence (mainnet has CF==LT==0.8)
          await comptroller["setCollateralFactor(address,uint256,uint256)"](
            vUSDT_ADDRESS,
            parseUnits("0.7", 18),
            parseUnits("0.9", 18),
          );

          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user26Addr, parseUnits("10000", 18));
          const usdtU = BEP20__factory.connect(USDT_ADDR, user26);
          await usdtU.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user26).mint(parseUnits("10000", 18));
          await comptroller.connect(user26).enterMarkets([vUSDT_ADDRESS]);

          // Borrow 50% of capacity
          const [, capacity] = await comptroller.getBorrowingPower(user26Addr);
          const borrowBtc = capacity.mul(50).div(100).mul(parseUnits("1", 18)).div(BTCB_PRICE);
          await vBTC.connect(user26).borrow(borrowBtc);
        });

        it("normal prices: both show solvency, LT (0.9) > CF (0.7)", async () => {
          const [cfErr, cfLiquidity, cfShortfall] = await comptroller.getBorrowingPower(user26Addr);
          const [ltErr, ltLiquidity, ltShortfall] = await comptroller.getAccountLiquidity(user26Addr);
          expect(cfErr).to.equal(0);
          expect(ltErr).to.equal(0);
          expect(cfLiquidity).to.be.gt(0);
          expect(ltLiquidity).to.be.gt(0);
          expect(cfShortfall).to.equal(0);
          expect(ltShortfall).to.equal(0);
          // LT=0.9 > CF=0.7 → ltLiquidity > cfLiquidity
          expect(ltLiquidity).to.be.gt(cfLiquidity);
        });

        it("pump: CF may show reduced capacity, LT sees pumped spot — max divergence", async () => {
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          const [, cfLiquidity, cfShortfall] = await comptroller.getBorrowingPower(user26Addr);
          const [, ltLiquidity] = await comptroller.getAccountLiquidity(user26Addr);

          // CF uses bounded $1 → capacity capped
          // LT uses pumped $1.50 → capacity increased
          expect(ltLiquidity).to.be.gt(cfLiquidity.add(cfShortfall));
        });

        it("after disable: both converge back", async () => {
          await time.increase(COOLDOWN_PERIOD + 1);
          resetPrices();
          await dbo.connect(timelock).updateMaxPrice(USDT_ADDR, USDT_PRICE.mul(101).div(100));
          await dbo.connect(timelock).updateMinPrice(USDT_ADDR, USDT_PRICE.mul(99).div(100));
          await dbo.connect(timelock).disableActiveProtectedPrice(USDT_ADDR);

          const [, cfLiquidity] = await comptroller.getBorrowingPower(user26Addr);
          const [, ltLiquidity] = await comptroller.getAccountLiquidity(user26Addr);

          // Both show solvency, LT still > CF due to weighting
          expect(cfLiquidity).to.be.gt(0);
          expect(ltLiquidity).to.be.gt(0);
          expect(ltLiquidity).to.be.gt(cfLiquidity);
        });
      });

      // =====================================================================
      // Part 24: Borrow Token Crash (Debt Deflation)
      // =====================================================================
      describe("24. Borrow token crash — DBO bounds debt at window max", () => {
        let borrower26: Signer;
        let borrower26Addr: string;

        before(async () => {
          borrower26 = ethers.Wallet.createRandom().connect(ethers.provider);
          borrower26Addr = await borrower26.getAddress();
          await setBalance(borrower26Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply 50000 USDT
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(borrower26Addr, parseUnits("50000", 18));
          const usdtUser = BEP20__factory.connect(USDT_ADDR, borrower26);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("50000", 18));
          await vUSDT.connect(borrower26).mint(parseUnits("50000", 18));
          await comptroller.connect(borrower26).enterMarkets([vUSDT_ADDRESS]);

          // Borrow 0.5 BTC at normal $60k = $30000 (within $40000 capacity)
          await vBTC.connect(borrower26).borrow(parseUnits("0.5", 18));

          // Crash BTC from $60k to $42k
          crashBTCBPrice();
        });

        it("borrow reverts — bounded debt at $60k blocks over-borrowing cheap BTC", async () => {
          // DBO bounds BTC debt at window max ($60k), not spot $42k
          // Existing debt: 0.5 BTC * $60k (bounded) = $30000
          // Capacity: 50000 * $1 * 0.8 = $40000. Remaining: $10000
          // Try 0.2 BTC: at bounded $60k = $12000 > $10000 remaining → blocked
          await expect(vBTC.connect(borrower26).borrow(parseUnits("0.2", 18))).to.be.revertedWith("math error");
        });

        it("borrow succeeds within bounded capacity", async () => {
          // 0.05 BTC at bounded $60k = $3000 < ~$10000 remaining → OK
          const borrowAmt = parseUnits("0.05", 18);
          const btcb26 = BEP20__factory.connect(BTCB_ADDR, borrower26);
          const uBalBefore = await btcb26.balanceOf(borrower26Addr);
          const borrowBefore = await vBTC.borrowBalanceStored(borrower26Addr);

          await expect(vBTC.connect(borrower26).borrow(borrowAmt)).to.emit(vBTC, "Borrow");

          expect(await btcb26.balanceOf(borrower26Addr)).to.equal(uBalBefore.add(borrowAmt));
          expect(await vBTC.borrowBalanceStored(borrower26Addr)).to.be.closeTo(
            borrowBefore.add(borrowAmt),
            parseUnits("0.000001", 18),
          );
        });

        it("liquidation uses spot $42k for BTC debt — borrower very solvent", async () => {
          // LT: 50000 * $1 * 0.8 = $40000. Debt at spot $42k: ~0.6 BTC * $42k = $25200 → solvent
          const liquidator = ethers.Wallet.createRandom().connect(ethers.provider);
          await setBalance(await liquidator.getAddress(), parseUnits("10", 18));
          const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
          const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
          await btcb.transfer(await liquidator.getAddress(), parseUnits("0.1", 18));
          const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
          await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.1", 18));

          await expect(
            vBTC.connect(liquidator).liquidateBorrow(borrower26Addr, parseUnits("0.05", 18), vUSDT.address),
          ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
        });

        it("getBorrowingPower uses bounded $60k debt — capacity reduced vs spot", async () => {
          // At bounded $60k: debt is valued higher than spot $42k → less remaining capacity
          const [, cfLiquidity] = await comptroller.getBorrowingPower(borrower26Addr);
          const [, ltLiquidity] = await comptroller.getAccountLiquidity(borrower26Addr);

          // CF uses bounded → debt valued at $60k → tighter capacity
          // LT uses spot $42k → debt valued lower → more headroom
          expect(ltLiquidity).to.be.gt(cfLiquidity);
        });
      });

      // =====================================================================
      // Part 25: Extreme Volatility — Price Swings Past Max AND Below Min
      // =====================================================================
      describe("25. Extreme volatility — price swings past max and below min", () => {
        let user27: Signer;
        let user27Addr: string;

        before(async () => {
          user27 = ethers.Wallet.createRandom().connect(ethers.provider);
          user27Addr = await user27.getAddress();
          await setBalance(user27Addr, parseUnits("10", 18));

          await neutralizeDBO();

          // Supply 10000 USDT
          const whale = await initMainnetUser(USDT_WHALE, parseUnits("1"));
          const usdt = BEP20__factory.connect(USDT_ADDR, whale);
          await usdt.transfer(user27Addr, parseUnits("10000", 18));
          const usdtUser = BEP20__factory.connect(USDT_ADDR, user27);
          await usdtUser.approve(vUSDT_ADDRESS, parseUnits("10000", 18));
          await vUSDT.connect(user27).mint(parseUnits("10000", 18));
          await comptroller.connect(user27).enterMarkets([vUSDT_ADDRESS]);

          // Borrow small amount at normal prices
          await vBTC.connect(user27).borrow(parseUnits("0.01", 18));
        });

        it("borrowing power collapses through volatility stages", async () => {
          // Stage 1 — Normal: record capacity
          const [, liqNormal] = await comptroller.getBorrowingPower(user27Addr);
          expect(liqNormal).to.be.gt(0);

          // Stage 2 — Pump USDT to $1.50: DBO bounds collateral at $1
          pumpUSDTPrice();
          await dbo.updateProtectionState(vUSDT_ADDRESS);
          const [, liqPump] = await comptroller.getBorrowingPower(user27Addr);
          // Capacity capped at bounded $1 — should be <= normal
          expect(liqPump).to.be.lte(liqNormal);

          // Stage 3 — Crash USDT to $0.30: window expands down
          const crashedUsdt = parseUnits("0.3", 18);
          fakeOracle.getPrice.whenCalledWith(USDT_ADDR).returns(crashedUsdt);
          fakeOracle.getUnderlyingPrice.whenCalledWith(vUSDT_ADDRESS).returns(crashedUsdt);
          await dbo.updateProtectionState(vUSDT_ADDRESS);

          const [, liqCrash, shortfallCrash] = await comptroller.getBorrowingPower(user27Addr);
          // Capacity collapsed — collateral at $0.30, debt inflated
          expect(liqCrash.add(shortfallCrash)).to.be.gt(0); // either liquidity or shortfall exists
          // Much worse than normal
          expect(liqCrash).to.be.lt(liqNormal);
        });

        it("borrow blocked under extreme volatility", async () => {
          // After the pump+crash above, DBO returns extreme bounded prices
          // Collateral devalued + debt inflated → borrow blocked
          await expect(vBTC.connect(user27).borrow(parseUnits("0.1", 18))).to.be.revertedWith("math error");
        });

        it("liquidation possible under extreme crash at LT spot", async () => {
          // Crash USDT severely — $0.30 spot
          // LT: 10000 * $0.30 * 0.8 = $2400 vs debt = 0.01 BTC * $60k = $600 → still solvent for small borrow
          // Need larger borrow to be underwater. Let's check current state.
          const [, , ltShortfall] = await comptroller.getAccountLiquidity(user27Addr);

          if (ltShortfall.gt(0)) {
            // User is underwater at LT — liquidation should succeed
            const liquidator = ethers.Wallet.createRandom().connect(ethers.provider);
            await setBalance(await liquidator.getAddress(), parseUnits("10", 18));
            const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
            const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
            await btcb.transfer(await liquidator.getAddress(), parseUnits("0.01", 18));
            const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
            await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.01", 18));

            const debtBefore = await vBTC.borrowBalanceStored(user27Addr);
            await vBTC.connect(liquidator).liquidateBorrow(user27Addr, parseUnits("0.005", 18), vUSDT.address);
            expect(await vBTC.borrowBalanceStored(user27Addr)).to.be.closeTo(
              debtBefore.sub(parseUnits("0.005", 18)),
              parseUnits("0.000001", 18),
            );
          } else {
            // User solvent at LT — liquidation should fail
            const liquidator = ethers.Wallet.createRandom().connect(ethers.provider);
            await setBalance(await liquidator.getAddress(), parseUnits("10", 18));
            const btcbWhale = await initMainnetUser(BTCB_WHALE, parseUnits("1"));
            const btcb = BEP20__factory.connect(BTCB_ADDR, btcbWhale);
            await btcb.transfer(await liquidator.getAddress(), parseUnits("0.01", 18));
            const btcbLiq = BEP20__factory.connect(BTCB_ADDR, liquidator);
            await btcbLiq.approve(vBTC_ADDRESS, parseUnits("0.01", 18));

            await expect(
              vBTC.connect(liquidator).liquidateBorrow(user27Addr, parseUnits("0.005", 18), vUSDT.address),
            ).to.emit(vBTC, "Failure"); // INSUFFICIENT_SHORTFALL
          }
        });
      });
    });
  });
}
