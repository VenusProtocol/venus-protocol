pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPancakeSwapV2Router.sol";
import "./interfaces/IVtoken.sol";
import "./interfaces/IWBNB.sol";
import "./lib/TransferHelper.sol";
import "./lib/PancakeLibrary.sol";
import "./interfaces/CustomErrors.sol";

/**
 * @title Venus's Pancake Swap Integration Contract
 * @notice This contracts allows users to swap a token for another one and supply/repay with the latter.
 * @dev For all functions that do not swap native BNB, user must approve this contract with the amount, prior the calling the swap function.
 * @author 0xlucian
 */

contract SwapRouter is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable, IPancakeSwapV2Router {
    /// @notice Address of WBNB contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WBNB;

    /// @notice Address of pancake swap factory contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable factory;

    enum TypesOfTokens {
        NON_SUPPORTING_FEE,
        SUPPORTING_FEE
    }

    // ***************
    // ** MODIFIERS **
    // ***************

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) {
            revert SwapDeadlineExpire(deadline, block.timestamp);
        }
        _;
    }

    receive() external payable {
        assert(msg.sender == WBNB); // only accept BNB via fallback from the WBNB contract
    }

    // **************
    // *** EVENTS ***
    // **************

    /// @notice This event is emitted whenever a successful swap (tokenA -> tokenB) occurs
    event SwapTokensForTokens(address indexed swapper, address[] indexed path, uint256[] indexed amounts);

    /// @notice This event is emitted whenever a successful swap (BNB -> token) occurs
    event SwapBnbForTokens(address indexed swapper, address[] indexed path, uint256[] indexed amounts);

    /// @notice This event is emitted whenever a successful supply on behalf of the user occurs
    event SupplyOnBehalf(address indexed supplier, address indexed vTokenAddress, uint256 indexed amount);

    /// @notice This event is emitted whenever a successful repay on behalf of the user occurs
    event RepayOnBehalf(address indexed repayer, address indexed vTokenAddress, uint256 indexed amount);

    // *********************
    // **** CONSTRUCTOR ****
    // *********************

    /// @notice Constructor for the implementation contract. Sets immutable variables.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address WBNB_, address factory_) {
        if (WBNB_ == address(0) || factory_ == address(0)) {
            revert ZeroAddress();
        }
        WBNB = WBNB_;
        factory = factory_;
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    // *********************
    // **** INITIALIZE *****
    // *********************
    function initialize() external initializer {
        __Ownable2Step_init();
        __ReentrancyGuard_init();
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
    ) external override ensure(deadline) {
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
    ) external override ensure(deadline) {
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
    ) external payable override ensure(deadline) {
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
    ) external payable override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap Exact tokens for BNB and supply to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountIn The amount of the tokens need to be swapped.
     * @param amountOutMin Minimum amount of BNB to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapExactTokensForETHAndSupply(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _supply(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap Exact tokens for BNB and supply to a Venus market
     * @param vTokenAddress The address of the vToken contract for supplying assets.
     * @param amountIn The amount of the tokens need to be swapped.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapExactTokensForETHAndSupplyAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
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
    ) external override ensure(deadline) {
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
    ) external payable override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapETHForExactTokens(amountOut, path, address(this));
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
    function swapTokensForExactETHAndSupply(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapTokensForExactETH(amountOut, amountInMax, path, address(this));
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
    ) external override ensure(deadline) {
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
    ) external override ensure(deadline) {
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
    ) external payable override ensure(deadline) {
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
    ) external payable override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactETHForTokens(amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap exact tokens for BNB and repay a borrow from a Venus market
     * @param vTokenAddress The address of the vToken contract to repay.
     * @param amountIn The amount of the tokens need to be swapped.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered so the swap path tokens are listed first and last asset is the token we receive
     */
    function swapExactTokensForETHAndRepay(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.NON_SUPPORTING_FEE);
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
    }

    /**
     * @notice Swap exact tokens for BNB and repay a borrow from a Venus market
     * @param vTokenAddress The address of the vToken contract to repay.
     * @param amountIn The amount of the tokens need to be swapped.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered so the swap path tokens are listed first and last asset is the token we receive
     */
    function swapExactTokensForETHAndRepayAtSupportingFee(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapExactTokensForETH(amountIn, amountOutMin, path, address(this), TypesOfTokens.SUPPORTING_FEE);
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
    ) external override ensure(deadline) {
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
    ) external payable override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapETHForExactTokens(amountOut, path, address(this));
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
    function swapTokensForExactETHAndRepay(
        address vTokenAddress,
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        uint256 deadline
    ) external override ensure(deadline) {
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
        _swapTokensForExactETH(amountOut, amountInMax, path, address(this));
        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        uint256 swapAmount = balanceAfter - balanceBefore;
        _repay(path[path.length - 1], vTokenAddress, swapAmount);
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
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
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
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = _swapExactTokensForTokens(amountIn, amountOutMin, path, to, TypesOfTokens.SUPPORTING_FEE);
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
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
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
    function swapExactETHForTokensAtSupportingFee(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = _swapExactETHForTokens(amountOutMin, path, to, TypesOfTokens.SUPPORTING_FEE);
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
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256[] memory amounts) {
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
    function swapExactTokensForETHAtSupportingFee(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = _swapExactTokensForETH(amountIn, amountOutMin, path, to, TypesOfTokens.SUPPORTING_FEE);
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
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
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
    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
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
    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = _swapTokensForExactETH(amountOut, amountInMax, path, to);
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

    // ****************************
    // **** INTERNAL FUNCTIONS ****
    // ****************************

    // **** SWAP ****
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
    function _swapSupportingFeeOnTransferTokens(
        uint256 amountIn,
        address[] memory path,
        address _to
    ) internal virtual returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
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
                amounts[i + 1] = amountOutput;
            }
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < path.length - 2 ? PancakeLibrary.pairFor(factory, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
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
        } else {
            emit SupplyOnBehalf(msg.sender, vTokenAddress, swapAmount);
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
        } else {
            emit RepayOnBehalf(msg.sender, vTokenAddress, swapAmount);
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
            _swapSupportingFeeOnTransferTokens(amounts[0], path, to);
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
            _swapSupportingFeeOnTransferTokens(amounts[0], path, to);
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
            _swapSupportingFeeOnTransferTokens(amounts[0], path, address(this));
        }
        IWBNB(WBNB).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
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
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }
}
