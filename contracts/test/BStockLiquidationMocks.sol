// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only mocks for exercising the BStockLiquidator contract (and the off-chain
///         scripts) on a local network, mimicking the Venus Core + Native interfaces they call.
///         Not for production.

contract MockMintableERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Receiver surface the flash comptroller calls back into. `address[]` matches the
///      `VToken[]` selector (a contract type canonicalizes to `address`).
interface IFlashReceiverLike {
    function executeOperation(
        address[] calldata vTokens,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        address onBehalf,
        bytes calldata param
    ) external returns (bool, uint256[] memory);
}

/// @dev Minimal VAIController stand-in. VAI is not a vToken and has no `underlying()`; the debt token
///      is resolved through `getVAIAddress()`, exactly as the real VAIController exposes it.
contract MockVAIController {
    address public immutable vai;

    constructor(address vai_) {
        vai = vai_;
    }

    function getVAIAddress() external view returns (address) {
        return vai;
    }
}

/// @dev Minimal Comptroller surface the script + BStockLiquidator read, plus a flash lender.
contract MockComptrollerLite {
    uint256 public shortfall;
    uint256 public closeFactorMantissa = 0.5e18;
    uint256 public liquidationIncentiveMantissa = 1.1e18;
    uint256 public flashPremiumMantissa; // fee on flash principal, 1e18-scaled (default 0)
    address public liquidatorContract; // pool-wide gate; 0 = permissionless (direct liquidateBorrow)
    uint256 public treasuryPercent; // redeem fee, 1e18-scaled (default 0)
    address public vaiController; // a debt equal to this is VAI (no underlying(); see MockVAIController)

    function setVaiController(address v) external {
        vaiController = v;
    }

    function setShortfall(uint256 s) external {
        shortfall = s;
    }

    function setTreasuryPercent(uint256 p) external {
        treasuryPercent = p;
    }

    function setLiquidatorContract(address l) external {
        liquidatorContract = l;
    }

    function setFlashPremium(uint256 m) external {
        flashPremiumMantissa = m;
    }

    function getAccountLiquidity(address) external view returns (uint256, uint256, uint256) {
        return (0, 0, shortfall);
    }

    /// @dev Mirrors the seize math: seizeTokens = repay * incentive (1:1 collateral rate here).
    function liquidateCalculateSeizeTokens(
        address,
        address,
        uint256 repayAmount
    ) external view returns (uint256, uint256) {
        return (0, (repayAmount * liquidationIncentiveMantissa) / 1e18);
    }

    /// @dev Borrower-aware 4-arg overload (the version vToken.liquidateBorrowFresh and the off-chain
    ///      scripts call). Same math here — the mock has a single pool — so both overloads agree.
    function liquidateCalculateSeizeTokens(
        address,
        address,
        address,
        uint256 repayAmount
    ) external view returns (uint256, uint256) {
        return (0, (repayAmount * liquidationIncentiveMantissa) / 1e18);
    }

    /// @dev VAI's seize math (VAIController.liquidateVAIFresh calls this): VAI is priced at $1 and the
    ///      incentive is the borrower-agnostic getLiquidationIncentive — hence the 2-arg shape.
    function liquidateVAICalculateSeizeTokens(address, uint256 repayAmount) external view returns (uint256, uint256) {
        return (0, (repayAmount * liquidationIncentiveMantissa) / 1e18);
    }

    /// @dev Read by the off-chain script to size the Venus Liquidator's bonus cut.
    function getEffectiveLiquidationIncentive(address, address) external view returns (uint256) {
        return liquidationIncentiveMantissa;
    }

    /// @dev Borrower-agnostic incentive — the one VAI's seize math uses.
    function getLiquidationIncentive(address) external view returns (uint256) {
        return liquidationIncentiveMantissa;
    }

    /// @dev Flash lender: send principal from the (pre-funded) debt vToken, call back, pull repay.
    function executeFlashLoan(
        address payable /* onBehalf */,
        address payable receiver,
        address[] calldata vTokens,
        uint256[] calldata amounts,
        bytes calldata param
    ) external {
        uint256[] memory premiums = new uint256[](1);
        premiums[0] = (amounts[0] * flashPremiumMantissa) / 1e18;

        MockVTokenDebt(vTokens[0]).flashOut(receiver, amounts[0]);
        (bool ok, uint256[] memory repay) = IFlashReceiverLike(receiver).executeOperation(
            vTokens,
            amounts,
            premiums,
            msg.sender,
            msg.sender,
            param
        );
        require(ok, "executeOperation failed");
        MockVTokenDebt(vTokens[0]).flashPull(receiver, repay[0]);
    }
}

/// @dev Collateral vToken mock. Tracks vToken balances; redeem() burns vTokens
///      and pays out the underlying bStock 1:1 (exchangeRate = 1 for the test).
contract MockVTokenCollateral {
    address public immutable underlying;
    address public immutable comptroller;
    mapping(address => uint256) public balanceOf;

    constructor(address underlying_, address comptroller_) {
        underlying = underlying_;
        comptroller = comptroller_;
    }

    /// Called by the debt vToken to credit seized collateral to the liquidator.
    function creditSeize(address to, uint256 vAmount) external {
        balanceOf[to] += vAmount;
    }

    uint256 public redeemError; // non-zero -> redeem returns this code (exercises RedeemFailed)

    function setRedeemError(uint256 e) external {
        redeemError = e;
    }

    function redeem(uint256 redeemTokens) external returns (uint256) {
        if (redeemError != 0) return redeemError;
        require(balanceOf[msg.sender] >= redeemTokens, "insufficient vTokens");
        balanceOf[msg.sender] -= redeemTokens;
        // 1:1 exchange rate for the test
        require(ERC20(underlying).transfer(msg.sender, redeemTokens), "redeem transfer failed");
        return 0;
    }

    /// @dev 1:1, matching `redeem` above. Read by the off-chain script to precompute the seize.
    function exchangeRateStored() external pure returns (uint256) {
        return 1e18;
    }
}

/// @dev Debt vToken mock. liquidateBorrow pulls `repayAmount` of the debt
///      underlying from the caller and credits seized collateral (repay + 10%).
contract MockVTokenDebt {
    address public immutable underlying;
    address public immutable comptroller;
    uint256 public incentiveMantissa = 1.1e18;
    uint256 public liquidateError; // non-zero -> liquidateBorrow returns this code (exercises LiquidateBorrowFailed)
    bool public constant isFlashLoanEnabled = true;

    constructor(address underlying_, address comptroller_) {
        underlying = underlying_;
        comptroller = comptroller_;
    }

    function setLiquidateError(uint256 e) external {
        liquidateError = e;
    }

    function liquidateBorrow(
        address /* borrower */,
        uint256 repayAmount,
        address vTokenCollateral
    ) external returns (uint256) {
        if (liquidateError != 0) return liquidateError;
        require(ERC20(underlying).transferFrom(msg.sender, address(this), repayAmount), "repay pull failed");
        uint256 seizeV = (repayAmount * incentiveMantissa) / 1e18;
        MockVTokenCollateral(vTokenCollateral).creditSeize(msg.sender, seizeV);
        return 0;
    }

    /// @dev Flash helpers, driven by MockComptrollerLite. Pre-fund this contract with `underlying`.
    function flashOut(address to, uint256 amount) external {
        require(msg.sender == comptroller, "only comptroller");
        require(ERC20(underlying).transfer(to, amount), "flash out failed");
    }

    function flashPull(address from, uint256 amount) external {
        require(msg.sender == comptroller, "only comptroller");
        // `from` (the receiver) approved THIS vToken as spender, per the real flash interface.
        require(ERC20(underlying).transferFrom(from, address(this), amount), "flash pull failed");
    }
}

/// @dev Stand-in for the Native router. Pulls tokenIn from the caller and pays
///      tokenOut at a configurable rate (1e18 = 1:1). Pre-fund it with tokenOut.
contract MockNativeRouter {
    uint256 public rate = 1e18; // tokenOut per tokenIn, 18-dec fixed point

    function setRate(uint256 r) external {
        rate = r;
    }

    function swap(address tokenIn, uint256 amountIn, address tokenOut, address to) external {
        require(ERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "in pull failed");
        uint256 amountOut = (amountIn * rate) / 1e18;
        require(ERC20(tokenOut).transfer(to, amountOut), "out transfer failed");
    }

    /// @dev Pulls the caller's ENTIRE tokenIn balance (what the liquidator actually holds after
    ///      redeem) and pays tokenOut at `rate`. Avoids fixed-amount rounding mismatches on forks.
    function swapAll(address tokenIn, address tokenOut, address to) external {
        uint256 amountIn = ERC20(tokenIn).balanceOf(msg.sender);
        require(ERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "in pull failed");
        uint256 amountOut = (amountIn * rate) / 1e18;
        require(ERC20(tokenOut).transfer(to, amountOut), "out transfer failed");
    }
}

/// @dev Malicious router: during the swap hop it re-enters the liquidator (via a preconfigured call)
///      before completing a normal swap. Used to prove the `nonReentrant` guard blocks re-entry while
///      the outer liquidation still settles. Must be allowlisted AND set as an operator so the re-entry
///      clears `onlyOperator` and actually reaches the reentrancy guard.
contract MockReentrantRouter {
    uint256 public rate = 1e18;
    address public target; // the liquidator to re-enter
    bytes public reentryCalldata; // encoded liquidate/flashLiquidate call
    bool public reentrySucceeded; // true iff the re-entry call returned success (guard FAILED)
    bool public reentryAttempted;

    function configure(address target_, bytes calldata reentryCalldata_) external {
        target = target_;
        reentryCalldata = reentryCalldata_;
    }

    function swap(address tokenIn, uint256 amountIn, address tokenOut, address to) external {
        reentryAttempted = true;
        // Attempt to re-enter; swallow the result so the OUTER swap/liquidation can still complete.
        (bool ok, ) = target.call(reentryCalldata);
        reentrySucceeded = ok;
        require(ERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "in pull failed");
        require(ERC20(tokenOut).transfer(to, (amountIn * rate) / 1e18), "out transfer failed");
    }

    /// @dev Same re-entry attempt, but pulls the caller's ENTIRE tokenIn balance and pays out — so the
    ///      OUTER liquidation actually settles (clearing minOut), letting the test observe that the
    ///      re-entry was blocked while the surrounding call succeeded.
    function swapAll(address tokenIn, address tokenOut, address to) external {
        reentryAttempted = true;
        (bool ok, ) = target.call(reentryCalldata);
        reentrySucceeded = ok;
        uint256 amountIn = ERC20(tokenIn).balanceOf(msg.sender);
        require(ERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "in pull failed");
        require(ERC20(tokenOut).transfer(to, (amountIn * rate) / 1e18), "out transfer failed");
    }

    function setRate(uint256 r) external {
        rate = r;
    }
}

/// @dev Stand-in for an aggregator (e.g. Liquid Mesh) whose settlement pulls the input token through a
///      SEPARATE spender contract, distinct from the call target. On Liquid Mesh you approve the spender
///      `0x8157…` but call the router `0x3d90…`. `MockSpender.pull` does the `transferFrom`, so the input
///      allowance must sit on the SPENDER, not the router — exactly the case `routerSpender` handles.
contract MockSpender {
    /// @dev Pull `amountIn` of `tokenIn` from `from` to `to`. `from` must have approved THIS contract.
    function pull(address tokenIn, address from, address to, uint256 amountIn) external {
        require(ERC20(tokenIn).transferFrom(from, to, amountIn), "spender pull failed");
    }
}

/// @dev The call target that pairs with `MockSpender`: it pulls the caller's input token VIA the spender
///      (so the caller must approve the spender, NOT this router) and pays the output at `rate`. Mirrors a
///      Liquid Mesh swap: `router.call(swapCalldata)` where settlement pulls via a separate spender.
///      Pre-fund it with `tokenOut`.
contract MockSplitRouter {
    address public immutable spender;
    uint256 public rate = 1e18; // tokenOut per tokenIn, 18-dec fixed point

    constructor(address spender_) {
        spender = spender_;
    }

    function setRate(uint256 r) external {
        rate = r;
    }

    function swap(address tokenIn, uint256 amountIn, address tokenOut, address to) external {
        // Pull via the spender — reverts with "spender pull failed" if the caller approved this router
        // instead of the spender (the SafeTransferFromFailed analog of Liquid Mesh's build-time sim).
        MockSpender(spender).pull(tokenIn, msg.sender, address(this), amountIn);
        require(ERC20(tokenOut).transfer(to, (amountIn * rate) / 1e18), "out transfer failed");
    }

    /// @dev Pulls the caller's ENTIRE tokenIn balance VIA THE SPENDER (what the liquidator holds after
    ///      redeem) and pays tokenOut at `rate`. Mirrors MockNativeRouter.swapAll but through the split
    ///      spender, so tests need not match the exact seized amount.
    function swapAll(address tokenIn, address tokenOut, address to) external {
        uint256 amountIn = ERC20(tokenIn).balanceOf(msg.sender);
        MockSpender(spender).pull(tokenIn, msg.sender, address(this), amountIn);
        require(ERC20(tokenOut).transfer(to, (amountIn * rate) / 1e18), "out transfer failed");
    }
}

/// @dev Stand-in for the pool-wide Venus Liquidator (`liquidatorContract`). Pulls the repay from the
///      caller and credits the seized collateral (repay * incentive) to the caller, minus a treasury cut.
contract MockVenusLiquidator {
    uint256 public incentiveMantissa = 1.1e18;
    uint256 public treasuryCutMantissa; // cut of the seized collateral kept by the liquidator (default 0)
    uint256 public pullMantissa = 1e18; // fraction of repayAmount actually pulled (default 100%)
    address public vBnb; // native BNB market; a repay for this vToken must arrive as msg.value
    address public vaiController; // VAI "market"; the repay is the VAI ERC20, resolved via getVAIAddress()

    function setTreasuryCut(uint256 m) external {
        treasuryCutMantissa = m;
    }

    /// @dev Simulate a partial repay pull (e.g. a close-factor cap): the gate pulls less than the
    ///      caller approved, so a standing allowance would linger unless the caller resets it.
    function setPullMantissa(uint256 m) external {
        pullMantissa = m;
    }

    /// @dev Mirrors the real gate: a vBNB repay is native BNB (msg.value), not an ERC20 transferFrom.
    function setVBnb(address v) external {
        vBnb = v;
    }

    /// @dev Mirrors `Liquidator._liquidateVAI`: a VAI repay is pulled as the VAI ERC20 (resolved via
    ///      `getVAIAddress()`, since the VAIController has no `underlying()`), then burned by the real
    ///      VAIController. Here we just keep it — only the pull is observable to the liquidator.
    function setVaiController(address v) external {
        vaiController = v;
    }

    /// @dev Mirrors the real Venus Liquidator getter the off-chain script reads to precompute the cut.
    function treasuryPercentMantissa() external view returns (uint256) {
        return treasuryCutMantissa;
    }

    function liquidateBorrow(
        address vToken,
        address /* borrower */,
        uint256 repayAmount,
        address vTokenCollateral
    ) external payable {
        if (vToken == vBnb) {
            // Native BNB repay: require exact msg.value (mirrors Liquidator.sol) and keep the BNB.
            require(msg.value == repayAmount, "bad value");
        } else {
            // VAI has no `underlying()` — resolve it via `getVAIAddress()`, like `Liquidator._liquidateVAI`.
            address underlying = vToken == vaiController
                ? MockVAIController(vToken).getVAIAddress()
                : MockVTokenDebt(vToken).underlying();
            uint256 pulled = (repayAmount * pullMantissa) / 1e18;
            require(ERC20(underlying).transferFrom(msg.sender, address(this), pulled), "repay pull failed");
        }
        uint256 seizeV = (repayAmount * incentiveMantissa) / 1e18;
        uint256 toCaller = seizeV - (seizeV * treasuryCutMantissa) / 1e18;
        MockVTokenCollateral(vTokenCollateral).creditSeize(msg.sender, toCaller);
    }
}

/// @dev Comptroller stand-in that drives the flash callback with deliberately wrong arguments, so the
///      receiver's mid-flight guards can be exercised. `mode` selects which invariant to violate; the
///      contract under test is deployed with this as its immutable comptroller. `getAccountLiquidity`
///      always reports a shortfall so the pre-flight `_check` passes and the callback is reached.
contract MockMaliciousFlashComptroller {
    enum Mode {
        BadInitiator, // report an initiator != the receiver
        WrongAsset // flash a vToken != params.vDebt
    }

    Mode public mode;
    address public liquidatorContract; // unset: the receiver would liquidate directly
    address public vaiController; // unset: `flashLiquidate`'s VAI check reads this and never matches vDebt

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    function getAccountLiquidity(address) external pure returns (uint256, uint256, uint256) {
        return (0, 0, 1);
    }

    function executeFlashLoan(
        address payable /* onBehalf */,
        address payable receiver,
        address[] calldata vTokens,
        uint256[] calldata amounts,
        bytes calldata param
    ) external {
        uint256[] memory premiums = new uint256[](1);
        if (mode == Mode.BadInitiator) {
            IFlashReceiverLike(receiver).executeOperation(
                vTokens,
                amounts,
                premiums,
                address(uint160(0xbad)), // initiator != receiver
                msg.sender,
                param
            );
        } else {
            address[] memory wrongAsset = new address[](1);
            wrongAsset[0] = address(uint160(0xdead)); // != params.vDebt
            IFlashReceiverLike(receiver).executeOperation(wrongAsset, amounts, premiums, receiver, msg.sender, param);
        }
    }
}
