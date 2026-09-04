/**
 * Contract ABIs shared by the bStock operator scripts (atomic-liquidate.ts and safe-fallback.ts).
 *
 * Both scripts read the same markets, pools and gate, and a signature that drifts between the two is a
 * silent wrong-calldata bug rather than a compile error — so they are declared once, here.
 *
 * THE CORE / ISOLATED SPLIT IS DELIBERATE. `CORE_COMPTROLLER_ABI` and `ISOLATED_COMPTROLLER_ABI` are kept
 * disjoint in their pool-SPECIFIC entries so that a wrong-mode call fails as an unknown-function TypeError
 * up front rather than as an opaque failure mid-run: none of Core's gate reads exist on an isolated pool,
 * and the pool has no fallback to answer them with a plausible zero. Do not "tidy" them into one list. Only
 * genuinely pool-agnostic getters appear in both, where a shared name really does mean shared semantics.
 *
 * Not everything lives here. `lib/vai-gate.ts` and `lib/psm.ts` keep their own narrow ABIs on purpose: each
 * is a self-contained helper whose surface is the handful of functions it calls, and widening it to the
 * lists below would let it reach for contracts it has no business touching.
 */

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/**
 * vToken surface common to both pools. `protocolSeizeShareMantissa` exists only on isolated markets and
 * `borrowBalanceStored` is absent from the two Core pseudo-markets (the vBNB sentinel and the
 * VAIController) — callers must reach for those only on the leg that has them.
 */
export const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function comptroller() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  // Isolated only: `VToken._seize` withholds this share of the seize for the ProtocolShareReserve.
  "function protocolSeizeShareMantissa() view returns (uint256)",
];

/// Isolated markets only, and read per-asset while walking `getAssetsIn`.
export const ISOLATED_VTOKEN_SNAPSHOT_ABI = [
  "function getAccountSnapshot(address) view returns (uint256,uint256,uint256,uint256)",
];

/// Core Pool `Comptroller` (the Unitroller diamond).
export const CORE_COMPTROLLER_ABI = [
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  // Borrower-aware 4-arg overload — the one `vToken.liquidateBorrowFresh` calls. The 3-arg isolated shape
  // does not exist here.
  "function liquidateCalculateSeizeTokens(address,address,address,uint256) view returns (uint256,uint256)",
  // VAI's seize math is a separate function: VAI is priced at $1 and the incentive is the
  // borrower-agnostic getLiquidationIncentive (see ComptrollerLens.liquidateVAICalculateSeizeTokens).
  "function liquidateVAICalculateSeizeTokens(address,uint256) view returns (uint256,uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  // Core has TWO forced-liquidation flags and `liquidateBorrowAllowed` ORs them; the isolated hook has only
  // the per-market one. Reading just the market flag would miss a per-user grant.
  "function isForcedLiquidationEnabled(address) view returns (bool)",
  "function isForcedLiquidationEnabledForUser(address,address) view returns (bool)",
  "function treasuryPercent() view returns (uint256)",
  "function liquidatorContract() view returns (address)",
  "function vaiController() view returns (address)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
  "function getLiquidationIncentive(address) view returns (uint256)",
];

/**
 * Isolated-pools `Comptroller` and its `SpokeComptroller` fork. See the header note on disjointness.
 *
 * `liquidationIncentiveMantissa()` is deliberately absent from BOTH lists: it answers for `msg.sender`, and
 * an eth_call carries no from-address, so it silently returns the pool-wide default and hides any
 * per-market override — a plausible-looking number that would scale a whole precompute wrong.
 */
export const ISOLATED_COMPTROLLER_ABI = [
  // Same 3-tuple and same liquidation-threshold weighting as Core, but the error slot is always 0: a bad
  // price REVERTS (PriceError / SnapshotError) instead of coming back as a code.
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  // 3-arg, and NO borrower argument — this is the overload `VToken._liquidateBorrowFresh` actually calls.
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  // Market-keyed, and the only safe way to read the incentive off-chain (see the note above).
  "function effectiveLiquidationIncentive(address) view returns (uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  "function minLiquidatableCollateral() view returns (uint256)",
  "function isLiquidationAllowlistEnabled() view returns (bool)",
  "function isAllowedLiquidator(address) view returns (bool)",
  "function isForcedLiquidationEnabled(address) view returns (bool)",
  "function actionPaused(address,uint8) view returns (bool)",
  "function checkMembership(address,address) view returns (bool)",
  "function getAssetsIn(address) view returns (address[])",
  "function oracle() view returns (address)",
  "function isMarketListed(address) view returns (bool)",
];

export const VAI_CONTROLLER_ABI = [
  "function getVAIAddress() view returns (address)",
  // VAI's "borrow balance": `liquidateBorrowAllowed` sizes the close-factor cap off this, NOT off
  // `borrowBalanceStored` — the VAIController is not a vToken and has no such function.
  "function getVAIRepayAmount(address) view returns (uint256)",
];

/// The pool-wide Venus Liquidator (`comptroller.liquidatorContract()`), which keeps a cut of the bonus.
export const VENUS_LIQUIDATOR_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];

export const POOL_REGISTRY_ABI = [
  "function getPoolByComptroller(address) view returns (tuple(string name,address creator,address comptroller,uint256 blockPosted,uint256 timestampPosted))",
];

export const ORACLE_ABI = ["function getUnderlyingPrice(address) view returns (uint256)"];

const PARAMS_TUPLE =
  "(address borrower,address vDebt,address vBStock,uint256 repayAmount,address router,bytes swapCalldata,uint256 minOut,address router2,bytes swapCalldata2,address intermediateToken,uint256 deadline)";

/// The BStockLiquidator itself. Only the atomic script sends through it; the Safe fallback deliberately
/// never touches it, which is why that script names its Core addresses as constants instead.
export const BSTOCK_LIQUIDATOR_ABI = [
  `function liquidate(${PARAMS_TUPLE}) returns (uint256)`,
  `function flashLiquidate(${PARAMS_TUPLE})`,
  "function isRouter(address) view returns (bool)",
  // The CORE comptroller baked into the contract as an immutable. Mode is whatever the collateral market's
  // own comptroller is compared against this, exactly as `_resolvePool` does it on-chain.
  "function comptroller() view returns (address)",
  // The registry that decides which non-Core pools may be liquidated in.
  "function poolRegistry() view returns (address)",
  // The native BNB market, also an immutable. `_settle` decides a debt is native by comparing vDebt against
  // THIS value, so read it rather than hardcode one: a constant that drifts from the deployed immutable
  // would put the script and the contract on different branches.
  "function vBNB() view returns (address)",
  // Isolated FLASH draws from a CORE market keyed by the isolated pool's debt token.
  "function coreFlashSource(address) view returns (address)",
];
