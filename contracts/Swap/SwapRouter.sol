pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IPancakeSwapV2Router.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IVtoken.sol";
import "./interfaces/IWBnb.sol";

/**
 * @title Venus's Pancake Swap Integration Contract
 * @notice This contracts allows users to swap a token for another one and supply/repay with the latter.
 * @dev For all functions that do not swap native BNB, user must approve this contract with the amount, prior the calling the swap function.
 * @author 0xlucian
 */
contract SwapRouter is Ownable2StepUpgradeable, ISwapRouter {
    using SafeERC20 for IERC20;

    address private wBNBAddress;
    address private swapRouterAddress;

    // **************
    // *** EVENTS ***
    // **************

    ///@notice This event is emitted whenever a successful supply on behalf of the user occurs
    event SupplyOnBehalf(address indexed supplier, address indexed vTokenAddress, uint256 indexed amount);

    ///@notice This event is emitted whenever a successful repay on behalf of the user occurs
    event RepayOnBehalf(address indexed repayer, address indexed vTokenAddress, uint256 indexed amount);

    // **************
    // *** ERRORS ***
    // **************

    ///@notice Error indicating that suplying to a given market failed.
    error SupplyError(address supplier, address vToken, uint256 errorCode);

    ///@notice Error indicating that repaying to given market failed.
    error RepayError(address repayer, address vToken, uint256 errorCode);

    ///@notice Error indicating wBNB address passed is not the expected one.
    error WrongAddress(address expectedAdddress, address passedAddress);

    // *********************
    // **** CONSTRUCTOR ****
    // *********************

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    // *********************
    // **** INITIALIZE *****
    // *********************
    function initialize(address wBNBAddress_, address swapRouterAddress_) public initializer {
        require(wBNBAddress_ != address(0), "Swap: wBNB address invalid");
        require(swapRouterAddress_ != address(0), "Swap: Pancake swap address invalid");
        __Ownable2Step_init();
        wBNBAddress = wBNBAddress_;
        swapRouterAddress = swapRouterAddress_;
    }

    // ****************************
    // **** EXTERNAL FUNCTIONS ****
    // ****************************

    /**
     * @notice Swap token A for token B and supplies to a Venus Market
     * @param vTokenAddress The address of the vToken contract to supply assets in.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     */
    function swapAndSupply(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path
    ) external override {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 receivedAmount = swap(amountIn, amountOutMin, path);
        IERC20(path[1]).safeApprove(vTokenAddress, receivedAmount);
        uint256 response = IVToken(vTokenAddress).mintBehalf(msg.sender, receivedAmount);
        if (response != 0) {
            revert SupplyError(msg.sender, vTokenAddress, response);
        }
    }

    /**
     * @notice Swap BNB for another token and supplies to a Venus Market
     * @dev The amount to be swapped is obtained from the msg.value, since we are swapping BNB
     * @param vTokenAddress The address of the vToken contract to supply assets in.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     * @dev In case of swapping native BNB the first asset in path array should be the wBNB address
     */
    function swapBnbAndSupply(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path
    ) external payable override {
        if (path[0] != wBNBAddress) {
            revert WrongAddress(wBNBAddress, path[0]);
        }
        IWBnb(path[0]).deposit{ value: msg.value }();
        uint256 receivedAmount = swap(msg.value, amountOutMin, path);
        uint256 response = IVToken(vTokenAddress).mintBehalf(msg.sender, receivedAmount);
        if (response != 0) {
            revert SupplyError(msg.sender, vTokenAddress, response);
        }
    }

    /**
     * @notice Swap token A for token B and repays a borrow from a Venus Market
     * @param vTokenAddress The address of the vToken contract to repay from.
     * @param amountIn The amount of tokens to swap.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     */
    function swapAndRepay(
        address vTokenAddress,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path
    ) external override {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 receivedAmount = swap(amountIn, amountOutMin, path);
        IERC20(path[1]).safeApprove(vTokenAddress, receivedAmount);
        uint256 response = IVToken(vTokenAddress).repayBorrowBehalf(msg.sender, receivedAmount);
        if (response != 0) {
            revert RepayError(msg.sender, vTokenAddress, response);
        }
    }

    /**
     * @notice Swap BNB for another token and repays a borrow from a Venus Market
     * @dev The amount to be swapped is obtained from the msg.value, since we are swapping BNB
     * @param vTokenAddress The address of the vToken contract to repay from.
     * @param amountOutMin Minimum amount of tokens to receive.
     * @param path Array with addresses of the underlying assets to be swapped
     * @dev Addresses of underlying assets should be ordered that first asset is the token we are swapping and second asset is the token we receive
     */
    function swapBnbAndRepay(
        address vTokenAddress,
        uint256 amountOutMin,
        address[] calldata path
    ) external payable override {
        if (path[0] != wBNBAddress) {
            revert WrongAddress(wBNBAddress, path[0]);
        }
        IWBnb(path[0]).deposit{ value: msg.value }();
        uint256 receivedAmount = swap(msg.value, amountOutMin, path);
        uint256 response = IVToken(vTokenAddress).repayBorrowBehalf(msg.sender, receivedAmount);
        if (response != 0) {
            revert RepayError(msg.sender, vTokenAddress, response);
        }
    }

    // ****************************
    // **** INTERNAL FUNCTIONS ****
    // ****************************

    function swap(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path
    ) internal returns (uint256 amountReceived) {
        IERC20(path[0]).safeApprove(swapRouterAddress, amountIn);
        uint256[] memory amounts = IPancakeSwapV2Router(swapRouterAddress).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            block.timestamp
        );

        amountReceived = amounts[1];
    }
}
