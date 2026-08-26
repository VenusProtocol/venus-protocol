// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only stand-ins for the hub-funded SPOKE pool, ported from the real contracts rather than
///         invented: `MockSpokeComptroller` mirrors `SpokeComptroller`'s liquidation surface and
///         `MockIsolatedVToken` the isolated `VToken` repay/seize/redeem path, seize arithmetic included.
///         None of them implements `liquidatorContract()`, `executeFlashLoan` or `vaiController()`, so an
///         accidental Core-branch call fails loudly here instead of silently passing. Not for production.

/// @dev Isolated pools answer `NO_ERROR` or revert; they never return a non-zero error code.
uint256 constant NO_ERROR = 0;

/// @dev `incomeType` is `IProtocolShareReserve.IncomeType` in the real interface; an enum ABI-encodes as
///      `uint8`, so the selector only matches if it is declared that way here too.
interface IProtocolShareReserveLike {
    function updateAssetsState(address comptroller, address asset, uint8 incomeType) external;
}

/// @dev Minimal ProtocolShareReserve. The isolated `VToken` transfers the withheld seize share here and then
///      pings it, so the mock has to accept both or the liquidation reverts.
contract MockSpokeProtocolShareReserve is IProtocolShareReserveLike {
    event AssetsStateUpdated(address comptroller, address asset, uint8 incomeType);

    function updateAssetsState(address comptroller, address asset, uint8 incomeType) external override {
        emit AssetsStateUpdated(comptroller, asset, incomeType);
    }
}

/**
 * @dev `SpokeComptroller` stand-in. Only the surface reached during a liquidation is modelled, but that
 *      surface is faithful: the same checks in the same order, the same revert names, and the same
 *      `msg.sender`-relative incentive resolution.
 */
contract MockSpokeComptroller {
    // Mirrors `Action` in the isolated pools' ComptrollerInterface.
    uint8 public constant ACTION_MINT = 0;
    uint8 public constant ACTION_REDEEM = 1;
    uint8 public constant ACTION_BORROW = 2;
    uint8 public constant ACTION_REPAY = 3;
    uint8 public constant ACTION_SEIZE = 4;
    uint8 public constant ACTION_LIQUIDATE = 5;

    error MarketNotListed(address vToken);
    error ActionPaused(address market, uint8 action);
    error InsufficientShortfall();
    error TooMuchRepay();
    error MinimalCollateralViolated(uint256 expectedGreaterThan, uint256 actual);
    error LiquidationNotAllowed(address liquidator);
    error MarketNotCollateral(address vToken, address user);
    error ComptrollerMismatch();

    mapping(address => bool) public isMarketListed;
    mapping(address => mapping(address => bool)) public accountMembership; // vToken -> account -> in market
    mapping(address => mapping(uint8 => bool)) public actionPaused; // market -> action -> paused
    mapping(address => bool) public isForcedLiquidationEnabled; // borrowed market -> forced on
    mapping(address => uint256) public liquidationIncentives; // per-market override, 0 = pool default
    mapping(address => uint256) public price; // vToken -> underlying price, 1e18

    // Pool-wide default. Internal, exactly as `SpokeComptrollerStorage` keeps it, because the public getter
    // below has to resolve per caller rather than hand this value to everyone.
    uint256 internal _poolLiquidationIncentiveMantissa = 1.1e18;

    uint256 public closeFactorMantissa = 0.5e18;
    uint256 public minLiquidatableCollateral = 100e18;

    // Liquidation allowlist: pool-wide, enforced in `preSeizeHook` against the account that RECEIVES the
    // collateral — i.e. the liquidator contract, never the operator EOA behind it.
    bool public isLiquidationAllowlistEnabled;
    mapping(address => bool) public isAllowedLiquidator;

    // Liquidity simulation. The real pool derives these from the oracle; here they are set per account.
    mapping(address => uint256) public shortfallOf;
    mapping(address => uint256) public totalCollateralOf;

    /// @dev `pure` in the real pool. Widened to `view` by the caller's interface, which is STATICCALL-safe.
    function isComptroller() external pure returns (bool) {
        return true;
    }

    /* ----------------------------- test setters ----------------------------- */

    function setMarketListed(address vToken, bool listed) external {
        isMarketListed[vToken] = listed;
    }

    function enterMarket(address vToken, address account, bool joined) external {
        accountMembership[vToken][account] = joined;
    }

    function setActionPaused(address market, uint8 action, bool paused) external {
        actionPaused[market][action] = paused;
    }

    function setForcedLiquidation(address vToken, bool enabled) external {
        isForcedLiquidationEnabled[vToken] = enabled;
    }

    function setLiquidationIncentive(uint256 m) external {
        _poolLiquidationIncentiveMantissa = m;
    }

    function setMarketLiquidationIncentive(address vToken, uint256 m) external {
        liquidationIncentives[vToken] = m;
    }

    function setPrice(address vToken, uint256 p) external {
        price[vToken] = p;
    }

    function setCloseFactor(uint256 m) external {
        closeFactorMantissa = m;
    }

    function setMinLiquidatableCollateral(uint256 m) external {
        minLiquidatableCollateral = m;
    }

    function setLiquidationAllowlistEnabled(bool enabled) external {
        isLiquidationAllowlistEnabled = enabled;
    }

    function setAllowedLiquidator(address liquidator, bool allowed) external {
        isAllowedLiquidator[liquidator] = allowed;
    }

    function setShortfall(address account, uint256 s) external {
        shortfallOf[account] = s;
    }

    function setTotalCollateral(address account, uint256 c) external {
        totalCollateralOf[account] = c;
    }

    /* ------------------------------- getters -------------------------------- */

    /**
     * @dev Answers for `msg.sender`, as the real pool does: `VToken._seize` calls this on itself and must see
     *      the COLLATERAL market's own discount. Any non-market caller reads the pool-wide default, which is
     *      why off-chain code has to ask `effectiveLiquidationIncentive` instead.
     */
    function liquidationIncentiveMantissa() external view returns (uint256) {
        return _liquidationIncentive(msg.sender);
    }

    function effectiveLiquidationIncentive(address vToken) external view returns (uint256) {
        return _liquidationIncentive(vToken);
    }

    function _liquidationIncentive(address vTokenCollateral) internal view returns (uint256) {
        uint256 incentive = liquidationIncentives[vTokenCollateral];
        return incentive != 0 ? incentive : _poolLiquidationIncentiveMantissa;
    }

    /**
     * @dev Same arithmetic and the same truncation order as the real pool:
     *      seizeTokens = repay * (incentive * priceBorrowed) / (priceCollateral * exchangeRate)
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        uint256 priceBorrowed = price[vTokenBorrowed];
        uint256 priceCollateral = price[vTokenCollateral];
        require(priceBorrowed != 0 && priceCollateral != 0, "price unset");
        uint256 exchangeRate = MockIsolatedVToken(vTokenCollateral).exchangeRateStored();

        uint256 numerator = (_liquidationIncentive(vTokenCollateral) * priceBorrowed) / 1e18;
        uint256 denominator = (priceCollateral * exchangeRate) / 1e18;
        uint256 ratio = (numerator * 1e18) / denominator;
        return (NO_ERROR, (ratio * actualRepayAmount) / 1e18);
    }

    /* -------------------------------- hooks --------------------------------- */

    /// @dev Mirrors `SpokeComptroller.preLiquidateHook`, minus the oracle refresh and reward flywheel.
    function preLiquidateHook(
        address vTokenBorrowed,
        address vTokenCollateral,
        address borrower,
        uint256 repayAmount,
        bool skipLiquidityCheck
    ) external view {
        _checkActionPauseState(vTokenBorrowed, ACTION_LIQUIDATE);

        if (!isMarketListed[vTokenBorrowed]) revert MarketNotListed(vTokenBorrowed);
        if (!isMarketListed[vTokenCollateral]) revert MarketNotListed(vTokenCollateral);

        uint256 borrowBalance = MockIsolatedVToken(vTokenBorrowed).borrowBalanceStored(borrower);

        if (skipLiquidityCheck || isForcedLiquidationEnabled[vTokenBorrowed]) {
            if (repayAmount > borrowBalance) revert TooMuchRepay();
            return;
        }

        if (totalCollateralOf[borrower] <= minLiquidatableCollateral) {
            revert MinimalCollateralViolated(minLiquidatableCollateral, totalCollateralOf[borrower]);
        }
        if (shortfallOf[borrower] == 0) revert InsufficientShortfall();

        uint256 maxClose = (closeFactorMantissa * borrowBalance) / 1e18;
        if (repayAmount > maxClose) revert TooMuchRepay();
    }

    /**
     * @dev Mirrors `SpokeComptroller.preSeizeHook`. `liquidator` is the account that RECEIVES the collateral,
     *      which is why the allowlist check here binds the liquidator CONTRACT and not the operator EOA.
     */
    function preSeizeHook(
        address vTokenCollateral,
        address seizerContract,
        address liquidator,
        address borrower
    ) external view {
        _checkActionPauseState(vTokenCollateral, ACTION_SEIZE);

        if (!isMarketListed[vTokenCollateral]) revert MarketNotListed(vTokenCollateral);

        if (seizerContract == address(this)) {
            if (MockIsolatedVToken(vTokenCollateral).comptroller() != address(this)) revert ComptrollerMismatch();
        } else {
            if (!isMarketListed[seizerContract]) revert MarketNotListed(seizerContract);
            if (MockIsolatedVToken(vTokenCollateral).comptroller() != MockIsolatedVToken(seizerContract).comptroller())
                revert ComptrollerMismatch();
        }

        if (!accountMembership[vTokenCollateral][borrower]) revert MarketNotCollateral(vTokenCollateral, borrower);

        _checkLiquidationAllowed(liquidator);
    }

    /// @dev Mirrors `SpokeComptroller.preRedeemHook` -> `_checkRedeemAllowed`: a redeemer that is not IN the
    ///      market bypasses the liquidity check entirely, which is what lets the liquidator redeem what it seized.
    function preRedeemHook(address vToken, address redeemer, uint256 /* redeemTokens */) external view {
        _checkActionPauseState(vToken, ACTION_REDEEM);
        if (!isMarketListed[vToken]) revert MarketNotListed(vToken);
        if (!accountMembership[vToken][redeemer]) return;
        if (shortfallOf[redeemer] != 0) revert InsufficientShortfall();
    }

    function seizeVerify(address, address, address, address, uint256) external {}

    function liquidateBorrowVerify(address, address, address, address, uint256, uint256) external {}

    function _checkActionPauseState(address market, uint8 action) private view {
        if (actionPaused[market][action]) revert ActionPaused(market, action);
    }

    function _checkLiquidationAllowed(address liquidator) private view {
        if (isLiquidationAllowlistEnabled && !isAllowedLiquidator[liquidator]) {
            revert LiquidationNotAllowed(liquidator);
        }
    }
}

/**
 * @dev Isolated-pools `VToken` stand-in. The parts `BStockLiquidator` touches behave as the real one does:
 *      `liquidateBorrow` answers NO_ERROR, the repay is capped at the outstanding balance, and `_seize`
 *      withholds `protocolSeizeShare` with the same arithmetic, so the liquidator's balance delta really
 *      does exclude the protocol's cut.
 */
contract MockIsolatedVToken {
    error LiquidateCloseAmountIsZero();
    error LiquidateCloseAmountIsUintMax();
    error LiquidateSeizeLiquidatorIsBorrower();

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event ProtocolSeize(address indexed from, address indexed to, uint256 amount);

    address public immutable underlying;
    address public immutable comptroller;
    address public protocolShareReserve;

    uint256 public protocolSeizeShareMantissa = 0.05e18;
    uint256 public exchangeRateMantissa = 1e18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf; // accountTokens
    mapping(address => uint256) public borrowBalanceStored; // accountBorrows

    constructor(address underlying_, address comptroller_, address protocolShareReserve_) {
        underlying = underlying_;
        comptroller = comptroller_;
        protocolShareReserve = protocolShareReserve_;
    }

    /* ----------------------------- test setters ----------------------------- */

    function setBorrow(address borrower, uint256 amount) external {
        borrowBalanceStored[borrower] = amount;
    }

    function setExchangeRate(uint256 m) external {
        exchangeRateMantissa = m;
    }

    function setProtocolSeizeShare(uint256 m) external {
        protocolSeizeShareMantissa = m;
    }

    function setProtocolShareReserve(address r) external {
        protocolShareReserve = r;
    }

    /// @dev Credit collateral vTokens to an account, as a supply would.
    function mintTo(address to, uint256 vAmount) external {
        balanceOf[to] += vAmount;
        totalSupply += vAmount;
    }

    function exchangeRateStored() external view returns (uint256) {
        return exchangeRateMantissa;
    }

    /* ------------------------------ liquidation ----------------------------- */

    /**
     * @dev `BStockLiquidator` calls this through `IVBep20`, which declares a `uint256` return, so a mock
     *      returning nothing would make every isolated repay fail on ABI decode.
     */
    function liquidateBorrow(
        address borrower,
        uint256 repayAmount,
        address vTokenCollateral
    ) external returns (uint256) {
        if (repayAmount == 0) revert LiquidateCloseAmountIsZero();
        if (repayAmount == type(uint256).max) revert LiquidateCloseAmountIsUintMax();

        MockSpokeComptroller(comptroller).preLiquidateHook(
            address(this),
            vTokenCollateral,
            borrower,
            repayAmount,
            false
        );

        // The pull is capped at the outstanding balance, exactly as `_repayBorrowFresh` does.
        uint256 owed = borrowBalanceStored[borrower];
        uint256 actualRepay = repayAmount >= owed ? owed : repayAmount;
        require(ERC20(underlying).transferFrom(msg.sender, address(this), actualRepay), "repay pull failed");
        borrowBalanceStored[borrower] = owed - actualRepay;

        (, uint256 seizeTokens) = MockSpokeComptroller(comptroller).liquidateCalculateSeizeTokens(
            address(this),
            vTokenCollateral,
            actualRepay
        );
        require(MockIsolatedVToken(vTokenCollateral).balanceOf(borrower) >= seizeTokens, "LIQUIDATE_SEIZE_TOO_MUCH");

        if (vTokenCollateral == address(this)) {
            _seize(address(this), msg.sender, borrower, seizeTokens);
        } else {
            MockIsolatedVToken(vTokenCollateral).seize(msg.sender, borrower, seizeTokens);
        }
        return NO_ERROR;
    }

    function seize(address liquidator, address borrower, uint256 seizeTokens) external {
        _seize(msg.sender, liquidator, borrower, seizeTokens);
    }

    /// @dev The exact arithmetic of the real `_seize`, including the `msg.sender`-relative incentive read.
    function _seize(address seizerContract, address liquidator, address borrower, uint256 seizeTokens) internal {
        MockSpokeComptroller(comptroller).preSeizeHook(address(this), seizerContract, liquidator, borrower);
        if (borrower == liquidator) revert LiquidateSeizeLiquidatorIsBorrower();

        // Read as THIS market, so the discount is the collateral market's own.
        uint256 incentive = MockSpokeComptroller(comptroller).liquidationIncentiveMantissa();
        uint256 numerator = (seizeTokens * protocolSeizeShareMantissa) / 1e18;
        uint256 protocolSeizeTokens = (numerator * 1e18) / incentive;
        uint256 liquidatorSeizeTokens = seizeTokens - protocolSeizeTokens;
        uint256 protocolSeizeAmount = (exchangeRateMantissa * protocolSeizeTokens) / 1e18;

        totalSupply -= protocolSeizeTokens;
        balanceOf[borrower] -= seizeTokens;
        balanceOf[liquidator] += liquidatorSeizeTokens;

        require(ERC20(underlying).transfer(protocolShareReserve, protocolSeizeAmount), "psr transfer failed");
        IProtocolShareReserveLike(protocolShareReserve).updateAssetsState(comptroller, underlying, 1); // LIQUIDATION

        emit Transfer(borrower, liquidator, liquidatorSeizeTokens);
        emit ProtocolSeize(borrower, protocolShareReserve, protocolSeizeAmount);

        MockSpokeComptroller(comptroller).seizeVerify(address(this), seizerContract, liquidator, borrower, seizeTokens);
    }

    /// @dev Returns NO_ERROR or reverts, like the real one. Pays out at the configured exchange rate.
    function redeem(uint256 redeemTokens) external returns (uint256) {
        MockSpokeComptroller(comptroller).preRedeemHook(address(this), msg.sender, redeemTokens);
        require(balanceOf[msg.sender] >= redeemTokens, "insufficient vTokens");
        balanceOf[msg.sender] -= redeemTokens;
        totalSupply -= redeemTokens;
        uint256 amount = (exchangeRateMantissa * redeemTokens) / 1e18;
        require(ERC20(underlying).transfer(msg.sender, amount), "redeem transfer failed");
        return NO_ERROR;
    }
}

/**
 * @dev Core-style flash-source market whose `underlying()` can be repointed after `setCoreFlashSource` has
 *      validated it. Proves `_flashSource`'s runtime re-check is not dead code.
 */
contract MockMutableFlashSource {
    address public underlying;
    address public immutable comptroller;
    bool public constant isFlashLoanEnabled = true;

    constructor(address underlying_, address comptroller_) {
        underlying = underlying_;
        comptroller = comptroller_;
    }

    function setUnderlying(address u) external {
        underlying = u;
    }

    function flashOut(address to, uint256 amount) external {
        require(msg.sender == comptroller, "only comptroller");
        require(ERC20(underlying).transfer(to, amount), "flash out failed");
    }

    function flashPull(address from, uint256 amount) external {
        require(msg.sender == comptroller, "only comptroller");
        require(ERC20(underlying).transferFrom(from, address(this), amount), "flash pull failed");
    }
}

/// @dev Answers `isComptroller()` with `false`. Proves `setAllowedComptroller` rejects it with {NotAComptroller}
///      rather than storing an address that only looks like a pool.
contract MockNotAComptroller {
    function isComptroller() external pure returns (bool) {
        return false;
    }
}

/**
 * @dev Looks like a spoke debt market to anything that trusts a market's own word: it reports an allowlisted
 *      pool as its `comptroller()`, names a real token as its `underlying()`, and drains whatever it was
 *      approved. The pool has no entry for it, which is why `_resolvePool` asks the pool and not the market.
 */
contract MockHostileDebtMarket {
    address public immutable underlying;
    address public immutable comptroller;
    uint256 public stolen;

    constructor(address underlying_, address comptroller_) {
        underlying = underlying_;
        comptroller = comptroller_;
    }

    /// @dev Pulls the caller's ENTIRE allowance, not just `repayAmount`.
    function liquidateBorrow(address, uint256, address) external returns (uint256) {
        uint256 allowed = ERC20(underlying).allowance(msg.sender, address(this));
        if (allowed != 0) {
            require(ERC20(underlying).transferFrom(msg.sender, address(this), allowed), "steal failed");
            stolen += allowed;
        }
        return NO_ERROR;
    }
}
