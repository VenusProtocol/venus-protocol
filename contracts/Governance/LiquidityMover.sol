// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { approveOrRevert } from "../lib/approveOrRevert.sol";

interface IV2LPToken is IERC20Upgradeable {
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IV2Router {
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);
}

interface IV3Pool {
    struct Slot0 {
        // the current price
        uint160 sqrtPriceX96;
        // the current tick
        int24 tick;
        // the most-recently updated index of the observations array
        uint16 observationIndex;
        // the current maximum number of observations that are being stored
        uint16 observationCardinality;
        // the next maximum number of observations to store, triggered in observations.write
        uint16 observationCardinalityNext;
        // the current protocol fee for token0 and token1,
        // 2 uint32 values store in a uint32 variable (fee/PROTOCOL_FEE_DENOMINATOR)
        uint32 feeProtocol;
        // whether the pool is locked
        bool unlocked;
    }

    function slot0() external view returns (Slot0 memory);
}

interface IV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (IV3Pool pool);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(
        MintParams calldata params
    ) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function factory() external view returns (IV3Factory);
}

contract LiquidityMover {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct MoveLiquidityParams {
        IV2LPToken lp;
        uint256 amount0Min;
        uint256 amount1Min;
        uint24 poolFee;
        int24 minTickCenter;
        int24 maxTickCenter;
        int24 tickSpread;
        address nftRecipient;
        address refundRecipient;
        uint256 deadline;
    }

    IV2Router public immutable V2_ROUTER;
    INonfungiblePositionManager public immutable V3_POSITION_MANAGER;
    address public immutable SWEEP_TOKEN_RECEIVER;

    error TickOutOfRange(int24 currentTick, int24 minTick, int24 maxTick);

    constructor(IV2Router v2Router, INonfungiblePositionManager v3PositionManager, address sweepTokenReceiver) {
        ensureNonzeroAddress(address(v2Router));
        ensureNonzeroAddress(address(v3PositionManager));
        ensureNonzeroAddress(sweepTokenReceiver);
        V2_ROUTER = v2Router;
        V3_POSITION_MANAGER = v3PositionManager;
        SWEEP_TOKEN_RECEIVER = sweepTokenReceiver;
    }

    function moveLiquidity(MoveLiquidityParams calldata params) external {
        uint256 liquidity = params.lp.balanceOf(address(this));
        IERC20Upgradeable token0 = IERC20Upgradeable(params.lp.token0());
        IERC20Upgradeable token1 = IERC20Upgradeable(params.lp.token1());
        approveOrRevert(params.lp, address(V2_ROUTER), liquidity);
        V2_ROUTER.removeLiquidity(
            address(token0),
            address(token1),
            liquidity,
            params.amount0Min,
            params.amount1Min,
            address(this),
            params.deadline
        );
        approveOrRevert(params.lp, address(V2_ROUTER), 0);

        (uint256 balance0, uint256 balance1) = _getSelfBalances(token0, token1);
        int24 currentTick = _getCurrentTick(token0, token1, params.poolFee);
        _validateTick(currentTick, params.minTickCenter, params.maxTickCenter);
        approveOrRevert(token0, address(V3_POSITION_MANAGER), balance0);
        approveOrRevert(token1, address(V3_POSITION_MANAGER), balance1);
        V3_POSITION_MANAGER.mint(
            INonfungiblePositionManager.MintParams({
                token0: address(token0),
                token1: address(token1),
                fee: params.poolFee,
                tickLower: currentTick - params.tickSpread,
                tickUpper: currentTick + params.tickSpread + 1, // tickUpper is exclusive
                amount0Desired: balance0,
                amount1Desired: balance1,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min,
                recipient: params.nftRecipient,
                deadline: params.deadline
            })
        );
        approveOrRevert(token0, address(V3_POSITION_MANAGER), 0);
        approveOrRevert(token1, address(V3_POSITION_MANAGER), 0);

        _transferAll(token0, params.refundRecipient);
        _transferAll(token1, params.refundRecipient);
    }

    function sweepToken(IERC20Upgradeable token) external {
        _transferAll(token, SWEEP_TOKEN_RECEIVER);
    }

    function _transferAll(IERC20Upgradeable token, address to) internal {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.safeTransfer(to, balance);
        }
    }

    function _getCurrentTick(
        IERC20Upgradeable token0,
        IERC20Upgradeable token1,
        uint24 fee
    ) internal view returns (int24) {
        IV3Factory factory = V3_POSITION_MANAGER.factory();
        IV3Pool pool = factory.getPool(address(token0), address(token1), fee);
        return pool.slot0().tick;
    }

    function _getSelfBalances(
        IERC20Upgradeable token0,
        IERC20Upgradeable token1
    ) internal view returns (uint256 balance0, uint256 balance1) {
        balance0 = token0.balanceOf(address(this));
        balance1 = token1.balanceOf(address(this));
    }

    function _validateTick(int24 currentTick, int24 minTick, int24 maxTick) internal pure {
        if (currentTick < minTick || currentTick > maxTick) {
            revert TickOutOfRange(currentTick, minTick, maxTick);
        }
    }
}
