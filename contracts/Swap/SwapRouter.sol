pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./interfaces/IPancakeSwapV2Router.sol";
import "./interfaces/IVtoken.sol";
import "./RouterHelper.sol";
import "./interfaces/IVBNB.sol";
import "./interfaces/InterfaceComptroller.sol";

/**
 * @title Venus's Pancake Swap Integration Contract
 * @notice This contracts allows users to swap a token for another one and supply/repay with the latter.
 * @dev For all functions that do not swap native BNB, user must approve this contract with the amount, prior the calling the swap function.
 * @author 0xlucian
 */

contract SwapRouter is Ownable2Step, RouterHelper, IPancakeSwapV2Router {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public immutable comptrollerAddress;

    // ***************
    // ** MODIFIERS **
    // ***************
    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) {
            revert SwapDeadlineExpire(deadline, block.timestamp);
        }
        _;
    }

    modifier ensureVTokenListed(address vTokenAddress) {
        bool isListed = InterfaceComptroller(comptrollerAddress).markets(vTokenAddress);
        if (isListed != true) {
            revert VTokenNotListed(vTokenAddress);
        }
        _;
    }

    modifier ensurePath(address[] calldata path) {
        if (path.length < 2) {
            revert InvalidPath();
        }
        _;
    }

    /// @notice event emitted on sweep token success
    event SweepToken(address indexed token, address indexed to, uint256 sweepAmount);

    // *********************
    // **** CONSTRUCTOR ****
    // *********************

    /// @notice Constructor for the implementation contract. Sets immutable variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address WBNB_, address factory_, address _comptrollerAddress) RouterHelper(WBNB_, factory_) {
        comptrollerAddress = _comptrollerAddress;
    }

    receive() external payable {
        assert(msg.sender == WBNB); // only accept BNB via fallback from the WBNB contract
    }

    // ****************************
    // **** EXTERNAL FUNCTIONS ****
    // ****************************

    /**
     * @notice Swap token A for token B and supply to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     */
    function swapExactTokensForTokensAndSupply(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap token A for token B and supply to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     */
    function swapExactTokensForTokensAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for another token and supply to a Venus market
     * @dev The amount to be swapped is obtained from the msg.value, since we are swapping BNB
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapExactBNBForTokensAndSupply(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for another token and supply to a Venus market
     * @dev The amount to be swapped is obtained from the msg.value, since we are swapping BNB
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapExactBNBForTokensAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap tokens for Exact tokens and supply to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapTokensForExactTokensAndSupply(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapTokensForExactTokens(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for Exact tokens and supply to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapBNBForExactTokensAndSupply(
        address vTokenAddress,
        uint256 amountOut,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapETHForExactTokens(amountOut, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap token A for token B and repay a borrow from a Venus market
     * @param vTokenAddress The address of the vToken contract to repay.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive (and repay)
     */
    function swapAndRepay(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap token A for token B and repay a borrow from a Venus market
     * @param vTokenAddress The address of the vToken contract to repay.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive (and repay)
     */
    function swapAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for another token and repay a borrow from a Venus market
     * @dev The amount to be swapped is obtained from the msg.value, since we are swapping BNB
     * @param vTokenAddress The address of the vToken contract to repay.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered so the swap path tokens are listed first and last asset is the token we receive
     */
    function swapExactBNBForTokensAndRepay(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for another token and repay a borrow from a Venus market
     * @dev The amount to be swapped is obtained from the msg.value, since we are swapping BNB
     * @param vTokenAddress The address of the vToken contract to repay.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered so the swap path tokens are listed first and last asset is the token we receive
     */
    function swapExactBNBForTokensAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap tokens for Exact tokens and repay to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapTokensForExactTokensAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapTokensForExactTokens(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap tokens for full tokens debt and repay to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapTokensForFullTokenDebtAndRepay(
        address vTokenAddress,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 amountOut = IVToken(vTokenAddress).borrowBalanceCurrent(msg.sender);
        _swapTokensForExactTokens(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for Exact tokens and repay to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapBNBForExactTokensAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapETHForExactTokens(amountOut, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap BNB for Exact tokens and repay to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapBNBForFullTokenDebtAndRepay(
        address vTokenAddress,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) ensurePath(path) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 amountOut = IVToken(vTokenAddress).borrowBalanceCurrent(msg.sender);
        _swapETHForExactTokens(amountOut, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap Exact tokens for BNB and repay to a Venus market
     * @param vBNBAddress The address of the vToken contract for supplying assets.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapExactTokensForBNBAndRepay(
        address vBNBAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensurePath(path) {
        uint256 balanceBefore = address(this).balance;
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = address(this).balance;
        uint256 swapAmount = balanceAfter - balanceBefore;
        IVBNB(vBNBAddress).repayBorrowBehalf{ value: swapAmount }(msg.sender);
    }

    /**
     * @notice Swap Exact tokens for BNB and repay to a Venus market
     * @param vBNBAddress The address of the vToken contract for supplying assets.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapExactTokensForBNBAndRepayAtSupportingFee(
        address vBNBAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensurePath(path) {
        uint256 balanceBefore = address(this).balance;
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = address(this).balance;
        uint256 swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
        IVBNB(vBNBAddress).repayBorrowBehalf{ value: swapAmount }(msg.sender);
    }

    /**
     * @notice Swap tokens for Exact BNB and repay to a Venus market
     * @param vBNBAddress The address of the vToken contract for supplying assets.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapTokensForExactBNBAndRepay(
        address vBNBAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensurePath(path) {
        uint256 balanceBefore = address(this).balance;
        _swapTokensForExactETH(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = address(this).balance;
        uint256 swapAmount = balanceAfter - balanceBefore;
        IVBNB(vBNBAddress).repayBorrowBehalf{ value: swapAmount }(msg.sender);
    }

    /**
     * @notice Swap tokens for Exact BNB and repay to a Venus market
     * @param vBNBAddress The address of the vToken contract for supplying assets.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapTokensForFullBNBDebtAndRepay(
        address vBNBAddress,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensurePath(path) {
        uint256 balanceBefore = address(this).balance;
        uint256 amountOut = IVToken(vBNBAddress).borrowBalanceCurrent(msg.sender);
        _swapTokensForExactETH(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = address(this).balance;
        uint256 swapAmount = balanceAfter - balanceBefore;
        IVBNB(vBNBAddress).repayBorrowBehalf{ value: swapAmount }(msg.sender);
    }

    /**
     * @notice Swaps an exact amount of input tokens for as many output tokens as possible,
     *         along the route determined by the path. The first element of path is the input token,
     *         the last is the output token, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountIn The address of the vToken contract to repay.
     * @param amountOutMin The minimum amount of output tokens that must be received for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) ensurePath(path) returns (uint256[] memory amounts) {
        amounts = _swapExactTokensForTokens(amountIn, amountOutMin, path, to, TypesOfTokens.NON_SUPPORTING_FEE);
    }

    /**
     * @notice Swaps an exact amount of input tokens for as many output tokens as possible,
     *         along the route determined by the path. The first element of path is the input token,
     *         the last is the output token, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     *         This method to swap deflationary tokens which would require supporting fee.
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountIn The address of the vToken contract to repay.
     * @param amountOutMin The minimum amount of output tokens that must be received for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     */
    function swapExactTokensForTokensAtSupportingFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) ensurePath(path) returns (uint256 swapAmount) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapExactTokensForTokens(amountIn, amountOutMin, path, to, TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(to);
        swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
    }

    /**
     * @notice Swaps an exact amount of ETH for as many output tokens as possible,
     *         along the route determined by the path. The first element of path must be WBNB,
     *         the last is the output token, and any intermediate elements represent
     *         intermediate pairs to trade through (if, for example, a direct pair does not exist).
     * @dev amountIn is passed through the msg.value of the transaction
     * @param amountOutMin The minimum amount of output tokens that must be received for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     */
    function swapExactBNBForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) ensurePath(path) returns (uint256[] memory amounts) {
        amounts = _swapExactETHForTokens(amountOutMin, path, to, TypesOfTokens.NON_SUPPORTING_FEE);
    }

    /**
     * @notice Swaps an exact amount of ETH for as many output tokens as possible,
     *         along the route determined by the path. The first element of path must be WBNB,
     *         the last is the output token, and any intermediate elements represent
     *         intermediate pairs to trade through (if, for example, a direct pair does not exist).
     *         This method to swap deflationary tokens which would require supporting fee.
     * @dev amountIn is passed through the msg.value of the transaction
     * @param amountOutMin The minimum amount of output tokens that must be received for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     */
    function swapExactBNBForTokensAtSupportingFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) ensurePath(path) returns (uint256 swapAmount) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapExactETHForTokens(amountOutMin, path, to, TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(to);
        swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
    }

    /**
     * @notice Swaps an exact amount of input tokens for as many output ETH as possible,
     *         along the route determined by the path. The first element of path is the input token,
     *         the last is the output ETH, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountIn The address of the vToken contract to repay.
     * @param amountOutMin The minimum amount of output tokens that must be received for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     */
    function swapExactTokensForBNB(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) ensurePath(path) returns (uint256[] memory amounts) {
        amounts = _swapExactTokensForETH(amountIn, amountOutMin, path, to, TypesOfTokens.NON_SUPPORTING_FEE);
    }

    /**
     * @notice Swaps an exact amount of input tokens for as many output ETH as possible,
     *         along the route determined by the path. The first element of path is the input token,
     *         the last is the output ETH, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     *         This method to swap deflationary tokens which would require supporting fee.
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountIn The address of the vToken contract to repay.
     * @param amountOutMin The minimum amount of output tokens that must be received for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     */
    function swapExactTokensForBNBAtSupportingFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) ensurePath(path) returns (uint256 swapAmount) {
        uint256 balanceBefore = to.balance;
        _swapExactTokensForETH(amountIn, amountOutMin, path, to, TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = to.balance;
        swapAmount = balanceAfter - balanceBefore;
        require(swapAmount >= amountOutMin, "SwapRouter: SwapAmount is less than amountOutMin");
    }

    /**
     * @notice Swaps an as many amount of input tokens for as exact amount of tokens as output,
     *         along the route determined by the path. The first element of path is the input token,
     *         the last is the output token, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     **/
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) ensurePath(path) returns (uint256[] memory amounts) {
        amounts = _swapTokensForExactTokens(amountOut, amountInMax, path, to);
    }

    /**
     * @notice Swaps an as ETH as input tokens for as exact amount of tokens as output,
     *         along the route determined by the path. The first element of path is the input WBNB,
     *         the last is the output as token, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     **/
    function swapBNBForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) ensurePath(path) returns (uint256[] memory amounts) {
        amounts = _swapETHForExactTokens(amountOut, path, to);
    }

    /**
     * @notice Swaps an as many amount of input tokens for as exact amount of ETH as output,
     *         along the route determined by the path. The first element of path is the input token,
     *         the last is the output as ETH, and any intermediate elements represent intermediate
     *         pairs to trade through (if, for example, a direct pair does not exist).
     * @dev msg.sender should have already given the router an allowance of at least amountIn on the input token.
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param amountInMax The maximum amount of input tokens that can be taken for the transaction not to revert.
     * @param path Array with addresses of the underlying assets to be swapped
     * @param to Recipient of the output tokens.
     * @param deadline Unix timestamp after which the transaction will revert.
     **/
    function swapTokensForExactBNB(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) ensurePath(path) returns (uint256[] memory amounts) {
        amounts = _swapTokensForExactETH(amountOut, amountInMax, path, to);
    }

    /**
     * @notice A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to admin (timelock)
     * @param token The address of the ERC-20 token to sweep
     * @param sweepAmount The ampunt of the tokens to sweep
     * @custom:access Only Governance
     */
    function sweepToken(IERC20Upgradeable token, address to, uint256 sweepAmount) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(sweepAmount <= balance, "SwapRouter::insufficient balance");
        token.safeTransfer(to, sweepAmount);

        emit SweepToken(address(token), to, sweepAmount);
    }

    /**
     * @notice supply token to a Venus market
     * @param path the addresses of the underlying token
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param swapAmount the amount of tokens supply to Venus Market.
     */
    function _supply(address path, address vTokenAddress, uint256 swapAmount) internal {
        TransferHelper.safeApprove(path, vTokenAddress, 0);
        TransferHelper.safeApprove(path, vTokenAddress, swapAmount);
        uint256 response = IVToken(vTokenAddress).mintBehalf(msg.sender, swapAmount);
        if (response != 0) {
            revert SupplyError(msg.sender, vTokenAddress, response);
        }
    }

    /**
     * @notice repay a borrow from Venus market
     * @param path the addresses of the underlying token
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param swapAmount the amount of tokens repay to Venus Market.
     */
    function _repay(address path, address vTokenAddress, uint256 swapAmount) internal {
        TransferHelper.safeApprove(path, vTokenAddress, 0);
        TransferHelper.safeApprove(path, vTokenAddress, swapAmount);
        uint256 response = IVToken(vTokenAddress).repayBorrowBehalf(msg.sender, swapAmount);
        if (response != 0) {
            revert RepayError(msg.sender, vTokenAddress, response);
        }
    }
}
