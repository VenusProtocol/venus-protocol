// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./lib/PancakeLibrary.sol";
import "./interfaces/IWBNB.sol";
import "./lib/TransferHelper.sol";

import "./interfaces/CustomErrors.sol";
import "./IRouterHelper.sol";

abstract contract RouterHelper is IRouterHelper {
    enum TypesOfTokens {
        NON_SUPPORTING_FEE,
        SUPPORTING_FEE
    }

    /// @notice Address of WBNB contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WBNB;

    /// @notice Address of pancake swap factory contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable factory;

    // **************
    // *** EVENTS ***
    // **************
    /// @notice This event is emitted whenever a successful swap (tokenA -> tokenB) occurs
    event SwapTokensForTokens(address indexed swapper, address[] indexed path, uint256[] indexed amounts);

    /// @notice This event is emitted whenever a successful swap (BNB -> token) occurs
    event SwapBnbForTokens(address indexed swapper, address[] indexed path, uint256[] indexed amounts);

    /// @notice This event is emitted whenever a successful swap (token -> BNB) occurs
    event SwapTokensForBnb(address indexed swapper, address[] indexed path, uint256[] indexed amounts);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address WBNB_, address factory_) {
        if (WBNB_ == address(0) || factory_ == address(0)) {
            revert ZeroAddress();
        }
        WBNB = WBNB_;
        factory = factory_;
    }

    // requires the initial amount to have already been sent to the first pair
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint256 i; i < path.length - 1; ++i) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = PancakeLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? PancakeLibrary.pairFor(factory, output, path[i + 2]) : _to;
            IPancakePair(PancakeLibrary.pairFor(factory, input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = PancakeLibrary.sortTokens(input, output);
            IPancakePair pair = IPancakePair(PancakeLibrary.pairFor(factory, input, output));
            uint256 amountInput;
            uint256 amountOutput;
            {
                // scope to avoid stack too deep errors
                (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) = input == token0
                    ? (reserve0, reserve1)
                    : (reserve1, reserve0);

                uint256 balance = IERC20(input).balanceOf(address(pair));
                amountInput = balance - reserveInput;
                amountOutput = PancakeLibrary.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < path.length - 2 ? PancakeLibrary.pairFor(factory, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function _swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        TypesOfTokens swapFor
    ) internal returns (uint256[] memory amounts) {
        amounts = PancakeLibrary.getAmountsOut(factory, amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) {
            revert OutputAmountBelowMinimum(amounts[amounts.length - 1], amountOutMin);
        }
        address pairAddress = PancakeLibrary.pairFor(factory, path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pairAddress, amounts[0]);
        if (swapFor == TypesOfTokens.NON_SUPPORTING_FEE) {
            _swap(amounts, path, to);
        } else {
            _swapSupportingFeeOnTransferTokens(path, to);
        }
        emit SwapTokensForTokens(msg.sender, path, amounts);
    }

    function _swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        TypesOfTokens swapFor
    ) internal returns (uint256[] memory amounts) {
        address wBNBAddress = WBNB;
        if (path[0] != wBNBAddress) {
            revert WrongAddress(wBNBAddress, path[0]);
        }
        amounts = PancakeLibrary.getAmountsOut(factory, msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin) {
            revert OutputAmountBelowMinimum(amounts[amounts.length - 1], amountOutMin);
        }
        IWBNB(wBNBAddress).deposit{ value: amounts[0] }();
        assert(IWBNB(wBNBAddress).transfer(PancakeLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        if (swapFor == TypesOfTokens.NON_SUPPORTING_FEE) {
            _swap(amounts, path, to);
        } else {
            _swapSupportingFeeOnTransferTokens(path, to);
        }
        emit SwapBnbForTokens(msg.sender, path, amounts);
    }

    function _swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        TypesOfTokens swapFor
    ) internal returns (uint256[] memory amounts) {
        if (path[path.length - 1] != WBNB) {
            revert WrongAddress(WBNB, path[path.length - 1]);
        }
        amounts = PancakeLibrary.getAmountsOut(factory, amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) {
            revert OutputAmountBelowMinimum(amounts[amounts.length - 1], amountOutMin);
        }
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            PancakeLibrary.pairFor(factory, path[0], path[1]),
            amounts[0]
        );
        if (swapFor == TypesOfTokens.NON_SUPPORTING_FEE) {
            _swap(amounts, path, address(this));
        } else {
            _swapSupportingFeeOnTransferTokens(path, address(this));
        }
        IWBNB(WBNB).withdraw(amounts[amounts.length - 1]);
        if (to != address(this)) {
            TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        }
        emit SwapTokensForBnb(msg.sender, path, amounts);
    }

    function _swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to
    ) internal returns (uint256[] memory amounts) {
        amounts = PancakeLibrary.getAmountsIn(factory, amountOut, path);
        if (amounts[0] > amountInMax) {
            revert InputAmountAboveMaximum(amounts[0], amountInMax);
        }
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            PancakeLibrary.pairFor(factory, path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, to);
        emit SwapTokensForTokens(msg.sender, path, amounts);
    }

    function _swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to
    ) internal returns (uint256[] memory amounts) {
        if (path[0] != WBNB) {
            revert WrongAddress(WBNB, path[0]);
        }
        amounts = PancakeLibrary.getAmountsIn(factory, amountOut, path);
        if (amounts[0] > msg.value) {
            revert ExcessiveInputAmount(amounts[0], msg.value);
        }
        IWBNB(WBNB).deposit{ value: amounts[0] }();
        assert(IWBNB(WBNB).transfer(PancakeLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
        emit SwapBnbForTokens(msg.sender, path, amounts);
    }

    function _swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to
    ) internal returns (uint256[] memory amounts) {
        if (path[path.length - 1] != WBNB) {
            revert WrongAddress(WBNB, path[path.length - 1]);
        }
        amounts = PancakeLibrary.getAmountsIn(factory, amountOut, path);
        if (amounts[0] > amountInMax) {
            revert InputAmountAboveMaximum(amounts[amounts.length - 1], amountInMax);
        }
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            PancakeLibrary.pairFor(factory, path[0], path[1]),
            amounts[0]
        );
        _swap(amounts, path, address(this));
        IWBNB(WBNB).withdraw(amounts[amounts.length - 1]);
        if (to != address(this)) {
            TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        }
        emit SwapTokensForBnb(msg.sender, path, amounts);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure virtual override returns (uint256 amountB) {
        return PancakeLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountOut) {
        return PancakeLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountIn) {
        return PancakeLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] memory path
    ) public view virtual override returns (uint256[] memory amounts) {
        return PancakeLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(
        uint256 amountOut,
        address[] memory path
    ) public view virtual override returns (uint256[] memory amounts) {
        return PancakeLibrary.getAmountsIn(factory, amountOut, path);
    }
}
