pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IPancakeSwapV2Router.sol";
import "./interfaces/IVtoken.sol";
import "./RouterHelper.sol";
import "./interfaces/IVBNB.sol";

import "./interfaces/InterfaceComptroller.sol";
import "hardhat/console.sol";

/**
 * @title Venus's Pancake Swap Integration Contract
 * @notice This contracts allows users to swap a token for another one and supply/repay with the latter.
 * @dev For all functions that do not swap native BNB, user must approve this contract with the amount, prior the calling the swap function.
 * @author 0xlucian
 */

contract SwapRouter is Ownable2StepUpgradeable, RouterHelper, IPancakeSwapV2Router {
    address public comptrollerAddress;

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
        (bool isListed) = InterfaceComptroller(comptrollerAddress).markets(vTokenAddress);
        if(isListed != true) {
            revert VTokenNotListed(vTokenAddress);
        }
        _;
    }

    // *********************
    // **** CONSTRUCTOR ****
    // *********************

    /// @notice Constructor for the implementation contract. Sets immutable variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address WBNB_, address factory_, address _comptrollerAddress) RouterHelper(WBNB_, factory_) {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
        comptrollerAddress = _comptrollerAddress;
    }

    receive() external payable {
        assert(msg.sender == WBNB); // only accept BNB via fallback from the WBNB contract
    }

    // *********************
    // **** INITIALIZE *****
    // *********************
    function initialize() external initializer {
        __Ownable2Step_init();
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
    function swapAndSupply(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) {
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
    function swapAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
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
    function swapBnbAndSupply(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) {
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
    function swapBnbAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
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
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) {
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
    function swapETHForExactTokensAndSupply(
        address vTokenAddress,
        uint256 amountOut,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) {
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
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) {
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
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
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
    function swapBnbAndRepay(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) {
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
    function swapBnbAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
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
    function swapTokensForExactTokensAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) ensureVTokenListed(vTokenAddress) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
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
    function swapETHForExactTokensAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) ensureVTokenListed(vTokenAddress) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
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
    function swapExactTokensForETHAndRepay(
        address vBNBAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) {
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
    function swapExactTokensForETHAndRepayAtSupportingFee(
        address vBNBAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) {
        uint256 balanceBefore = address(this).balance;
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = address(this).balance;
        uint256 swapAmount = balanceAfter - balanceBefore;
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
    function swapTokensForExactETHAndRepay(
        address vBNBAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external payable override ensure(deadline) {
        uint256 balanceBefore = address(this).balance;
        _swapTokensForExactETH(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = address(this).balance;
        uint256 swapAmount = balanceAfter - balanceBefore;
        IVBNB(vBNBAddress).repayBorrowBehalf{ value: swapAmount }(msg.sender);
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
