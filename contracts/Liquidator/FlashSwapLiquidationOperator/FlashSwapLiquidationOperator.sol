// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { IPancakeV3FlashCallback } from "@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3FlashCallback.sol";
import { IPancakeV3SwapCallback } from "@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3SwapCallback.sol";
import { IPancakeV3Pool } from "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IWBNB } from "../../Swap/interfaces/IWBNB.sol";
import { ensureNonzeroAddress } from "../zeroAddress.sol";
import { BUSDLiquidator } from "../BUSDLiquidator.sol";
import { IVToken, IVBep20, IVBNB } from "../Interfaces.sol";
import { UnifiedVTokenHandler } from "./UnifiedVTokenHandler.sol";
import { PathExt } from "./PathExt.sol";
import { ISmartRouter } from "./pancakeswap-v8/ISmartRouter.sol";
import { Path } from "./pancakeswap-v8/Path.sol";
import { PoolAddress } from "./pancakeswap-v8/PoolAddress.sol";
import { approveOrRevert } from "../approveOrRevert.sol";
import { MIN_SQRT_RATIO, MAX_SQRT_RATIO } from "./pancakeswap-v8/constants.sol";

contract FlashSwapLiquidationOperator is IPancakeV3FlashCallback, IPancakeV3SwapCallback, UnifiedVTokenHandler {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using Path for bytes;
    using PathExt for bytes;

    /// @notice Liquidation parameters
    struct FlashLiquidationParameters {
        /// @notice The receiver of the liquidated collateral
        address beneficiary;
        /// @notice Borrower whose position is being liquidated
        address borrower;
        /// @notice Amount of borrowed tokens to repay
        uint256 repayAmount;
        /// @notice Collateral vToken to seize
        IVToken vTokenCollateral;
        /// @notice Reversed (!) swap path to use for liquidation. For regular (not in-kind)
        /// liquidations it should start with the borrowed token and end with the collateral
        /// token. For in-kind liquidations, must consist of a single PancakeSwap pool to
        /// source the liquidity from.
        bytes path;
        /// @notice Deadline for the transaction execution
        uint256 deadline;
    }

    /// @notice Callback data passed to the flash or swap callback
    struct CallbackData {
        /// @notice Liquidation parameters
        FlashLiquidationParameters params;
        /// @notice Pool key of the pool that called the callback
        PoolAddress.PoolKey poolKey;
    }

    /// @notice The PancakeSwap SmartRouter contract
    ISmartRouter public immutable swapRouter;

    /// @notice The BUSD liquidator contract
    BUSDLiquidator public immutable busdLiquidator;

    /// @notice The PancakeSwap deployer contract
    address public immutable deployer;

    /// @notice Thrown if the provided swap path start does not correspond to the borrowed token
    /// @param expected Expected swap path start (borrowed token)
    /// @param actual Provided swap path start
    error InvalidSwapStart(address expected, address actual);

    /// @notice Thrown if the provided swap path end does not correspond to the collateral token
    /// @param expected Expected swap path end (collateral token)
    /// @param actual Provided swap path end
    error InvalidSwapEnd(address expected, address actual);

    /// @notice Thrown if flash callback or swap callback is called by a non-PancakeSwap contract
    /// @param expected Expected callback sender (pool address computed based on the pool key)
    /// @param actual Actual callback sender
    error InvalidCallbackSender(address expected, address actual);

    /// @notice Thrown if received a native asset from any account except vNative
    /// @param expected Expected asset sender, vNative
    /// @param actual Actual asset sender
    error InvalidNativeAssetSender(address expected, address actual);

    /// @notice Thrown if the flash callback is unexpectedly called when performing a cross-token liquidation
    error FlashNotInKind();

    /// @notice Thrown if the swap callback is called with unexpected or zero amount of tokens
    error EmptySwap();

    /// @notice Thrown if the deadline has passed
    error DeadlinePassed(uint256 currentTimestamp, uint256 deadline);

    /// @param vNative_ vToken that wraps the native asset
    /// @param swapRouter_ PancakeSwap SmartRouter contract
    /// @param busdLiquidator_ BUSD liquidator contract
    constructor(
        IVBNB vNative_,
        ISmartRouter swapRouter_,
        BUSDLiquidator busdLiquidator_
    ) UnifiedVTokenHandler(vNative_, IWBNB(swapRouter_.WETH9())) {
        ensureNonzeroAddress(address(swapRouter_));
        ensureNonzeroAddress(address(busdLiquidator_));

        swapRouter = swapRouter_;
        busdLiquidator = busdLiquidator_;
        deployer = swapRouter_.deployer();
    }

    /// @notice A function that receives native assets from vNative
    receive() external payable {
        if (msg.sender != address(vNative)) {
            revert InvalidNativeAssetSender(address(vNative), msg.sender);
        }
    }

    /// @notice Liquidates a borrower's position using flash swap
    /// @param params Liquidation parameters
    function liquidate(FlashLiquidationParameters calldata params) external {
        if (params.deadline < block.timestamp) {
            revert DeadlinePassed(block.timestamp, params.deadline);
        }

        address borrowedTokenAddress = address(borrowedToken());
        address collateralTokenAddress = address(_underlying(params.vTokenCollateral));

        (address startTokenA, address startTokenB, uint24 fee) = params.path.decodeFirstPool();
        if (startTokenA != borrowedTokenAddress) {
            revert InvalidSwapStart(borrowedTokenAddress, startTokenA);
        }

        PoolAddress.PoolKey memory poolKey = PoolAddress.getPoolKey(startTokenA, startTokenB, fee);

        if (collateralTokenAddress == borrowedTokenAddress) {
            _flashLiquidateInKind(poolKey, params);
        } else {
            (, address endToken, ) = params.path.decodeLastPool();
            if (endToken != collateralTokenAddress) {
                revert InvalidSwapEnd(collateralTokenAddress, endToken);
            }
            _flashLiquidateCross(poolKey, params);
        }
    }

    /// @notice Callback called by PancakeSwap pool during in-kind liquidation. Liquidates the
    /// borrow, seizing vTokens with the same underlying as the borrowed asset, redeems these
    /// vTokens and repays the flash swap.
    /// @param fee0 Fee amount in pool's token0
    /// @param fee1 Fee amount in pool's token1
    /// @param data Callback data, passed during _flashLiquidateInKind
    function pancakeV3FlashCallback(uint256 fee0, uint256 fee1, bytes memory data) external {
        CallbackData memory decoded = abi.decode(data, (CallbackData));
        _verifyCallback(decoded.poolKey);

        FlashLiquidationParameters memory params = decoded.params;
        IERC20Upgradeable collateralToken = _underlying(params.vTokenCollateral);
        if (address(collateralToken) != address(borrowedToken())) {
            revert FlashNotInKind();
        }

        uint256 receivedAmount = _liquidateAndRedeem(params.borrower, params.repayAmount, params.vTokenCollateral);

        uint256 fee = (fee0 == 0 ? fee1 : fee0);
        approveOrRevert(collateralToken, address(swapRouter), receivedAmount);
        collateralToken.safeTransfer(msg.sender, params.repayAmount + fee);
        collateralToken.safeTransfer(params.beneficiary, collateralToken.balanceOf(address(this)));
    }

    /// @notice Callback called by PancakeSwap pool during regular (cross-token) liquidations.
    /// Liquidates the borrow, seizing vTokenCollateral, redeems these vTokens and repays the flash swap.
    /// If necessary, swaps the collateral tokens to the pool tokens to repay the flash swap.
    /// @param amount0Delta Amount of pool's token0 to repay (negative if token0 is the borrowed token)
    /// @param amount1Delta Amount of pool's token1 to repay (negative if token1 is the borrowed token)
    /// @param data Callback data, passed during _flashLiquidateCross
    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        CallbackData memory decoded = abi.decode(data, (CallbackData));
        _verifyCallback(decoded.poolKey);
        if (amount0Delta <= 0 && amount1Delta <= 0) {
            revert EmptySwap();
        }
        FlashLiquidationParameters memory params = decoded.params;

        uint256 receivedAmount = _liquidateAndRedeem(params.borrower, params.repayAmount, params.vTokenCollateral);
        IERC20Upgradeable collateralToken = _underlying(params.vTokenCollateral);

        uint256 amountToPay;
        IERC20Upgradeable tokenToPay;
        if (amount0Delta > 0) {
            tokenToPay = IERC20Upgradeable(decoded.poolKey.token0);
            amountToPay = uint256(amount0Delta);
        } else if (amount1Delta > 0) {
            tokenToPay = IERC20Upgradeable(decoded.poolKey.token1);
            amountToPay = uint256(amount1Delta);
        }

        if (params.path.hasMultiplePools()) {
            // Swap collateral token to the pool token and pay for the current swap
            bytes memory remainingPath = params.path.skipToken();
            approveOrRevert(collateralToken, address(swapRouter), receivedAmount);
            swapRouter.exactOutput(
                ISmartRouter.ExactOutputParams({
                    path: remainingPath,
                    recipient: msg.sender, // repaying to the pool
                    amountOut: amountToPay,
                    amountInMaximum: receivedAmount
                })
            );
            approveOrRevert(collateralToken, address(swapRouter), 0);
        } else {
            // Pay for the swap directly with collateral tokens
            collateralToken.safeTransfer(msg.sender, amountToPay);
        }
        collateralToken.safeTransfer(params.beneficiary, collateralToken.balanceOf(address(this)));
    }

    /// @notice Returns the BUSD vToken
    function vTokenBorrowed() public view returns (IVBep20) {
        return busdLiquidator.vBUSD();
    }

    /// @notice Returns the BUSD token
    function borrowedToken() public view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(vTokenBorrowed().underlying());
    }

    /// @dev Flash-borrows the borrowed token and starts the in-kind liquidation process
    /// @param poolKey The pool key of the pool to flash-borrow from
    /// @param params Liquidation parameters
    function _flashLiquidateInKind(
        PoolAddress.PoolKey memory poolKey,
        FlashLiquidationParameters calldata params
    ) internal {
        IPancakeV3Pool pool = IPancakeV3Pool(PoolAddress.computeAddress(deployer, poolKey));
        address borrowedTokenAddress = address(borrowedToken());
        pool.flash(
            address(this),
            poolKey.token0 == borrowedTokenAddress ? params.repayAmount : 0,
            poolKey.token1 == borrowedTokenAddress ? params.repayAmount : 0,
            abi.encode(CallbackData(params, poolKey))
        );
    }

    /// @dev Flash-swaps the pool's tokenB to the borrowed token and starts the cross-token
    /// liquidation process. Regardless of what tokenB is, we will later swap the seized
    /// collateral tokens to the pool's tokenB along the path to repay the flash swap if needed.
    /// @param poolKey The pool key of the pool to flash-swap in
    /// @param params Liquidation parameters
    function _flashLiquidateCross(
        PoolAddress.PoolKey memory poolKey,
        FlashLiquidationParameters calldata params
    ) internal {
        IPancakeV3Pool pool = IPancakeV3Pool(PoolAddress.computeAddress(deployer, poolKey));

        bool zeroForOne = poolKey.token1 == address(borrowedToken());
        uint160 sqrtPriceLimitX96 = (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1);
        pool.swap(
            address(this),
            zeroForOne,
            -int256(params.repayAmount),
            sqrtPriceLimitX96,
            abi.encode(CallbackData(params, poolKey))
        );
    }

    /// @dev Liquidates the borrow repaying the borrowed tokens, seizes vTokenCollateral,
    /// redeems these vTokens and returns the received amount
    /// @param borrower Borrower whose position to liquidate
    /// @param repayAmount Amount of borrowed tokens to repay
    /// @param vTokenCollateral Collateral vToken to seize
    /// @return Amount of collateral tokens received
    function _liquidateAndRedeem(
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    ) internal returns (uint256) {
        uint256 vTokenBalanceBefore = vTokenCollateral.balanceOf(address(this));
        approveOrRevert(borrowedToken(), address(busdLiquidator), repayAmount);
        busdLiquidator.liquidateBorrow(borrower, repayAmount, vTokenCollateral);
        approveOrRevert(borrowedToken(), address(busdLiquidator), 0);
        uint256 vTokensReceived = vTokenCollateral.balanceOf(address(this)) - vTokenBalanceBefore;
        return _redeem(vTokenCollateral, vTokensReceived);
    }

    /// @dev Ensures that the caller of a callback is a legitimate PancakeSwap pool
    /// @param poolKey The pool key of the pool to verify
    function _verifyCallback(PoolAddress.PoolKey memory poolKey) internal view {
        address pool = PoolAddress.computeAddress(deployer, poolKey);
        if (msg.sender != pool) {
            revert InvalidCallbackSender(pool, msg.sender);
        }
    }
}
