// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { IVToken } from "./interfaces/IVtoken.sol";

/**
 * @title INativeTokenGateway
 * @author Venus
 * @notice Interface for NativeTokenGateway contract
 */
interface INativeTokenGateway {
    /**
     * @notice Thrown if transfer of native token fails
     */
    error NativeTokenTransferFailed();

    /**
     * @notice Thrown if the supplied address is a zero address where it is not allowed
     */
    error ZeroAddressNotAllowed();

    /**
     * @notice Thrown if the supplied value is 0 where it is not allowed
     */
    error ZeroValueNotAllowed();

    /**
     * @notice Thrown if vToken's mintBehalf fails
     */
    error MintBehalfFailed(uint256 error);

    /**
     * @notice Thrown if vToken's redeem fails
     */
    error RedeemFailed(uint256 error);

    /**
     * @notice Thrown if vToken's borrowBehalf fails
     */
    error BorrowBehalfFailed(uint256 error);

    /**
     * @notice Thrown if vToken's repayBorrowBehalf fails
     */
    error RepayBorrowBehalfFailed(uint256 error);

    /**
     * @dev Emitted when WETH is swept from the contract
     */
    event SweepToken(address indexed sender, uint256 amount);

    /**
     * @dev Emitted when native asset is swept from the contract
     */
    event SweepNative(address indexed sender, uint256 amount);

    /**
     * @dev Wrap ETH, get WETH, mint vWETH, and supply to the market
     * @param vToken The vToken market to interact with
     * @param minter The address on behalf of whom the supply is performed
     */
    function wrapAndSupply(IVToken vToken, address minter) external payable;

    /**
     * @dev Redeem vWETH, unwrap to ETH, and send to the user
     * @param vToken The vToken market to interact with
     * @param redeemAmount The amount of underlying tokens to redeem
     */
    function redeemUnderlyingAndUnwrap(IVToken vToken, uint256 redeemAmount) external payable;

    /**
     * @dev Borrow WETH, unwrap to ETH, and send to the user
     * @param vToken The vToken market to interact with
     * @param borrower Address of the borrower
     * @param amount The amount of underlying tokens to borrow
     */
    function borrowAndUnwrap(IVToken vToken, address borrower, uint256 amount) external;

    /**
     * @dev Wrap ETH, repay borrow in the market, and send remaining ETH to the user
     * @param vToken The vToken market to interact with
     */
    function wrapAndRepay(IVToken vToken) external payable;

    /**
     * @dev Sweeps WETH tokens from the contract and sends them to the owner
     */
    function sweepToken() external;

    /**
     * @dev Sweeps native assets (ETH) from the contract and sends them to the owner
     */
    function sweepNative() external payable;
}
