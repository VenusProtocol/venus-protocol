pragma solidity 0.8.13;

interface IPancakeSwapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactTokensForTokensAtSupportingFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactETHForTokensAtSupportingFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapExactTokensForETHAtSupportingFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function swapAndSupply(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapBnbAndSupply(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapBnbAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapTokensForExactTokensAndSupply(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapETHForExactTokensAndSupply(
        address vTokenAddress,
        uint256 amountOut,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapAndRepay(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapBnbAndRepay(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapBnbAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapTokensForExactTokensAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapTokensForFullTokenDebtAndRepay(
        address vTokenAddress,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external;

    function swapETHForExactTokensAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapExactTokensForETHAndRepay(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapExactTokensForETHAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapTokensForExactETHAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external payable;

    function swapTokensForFullETHDebtAndRepay(
        address vBNBAddress,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external payable;
}
