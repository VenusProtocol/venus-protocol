// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { approveOrRevert } from "../lib/approveOrRevert.sol";
import { IVBep20, IComptroller } from "../InterfacesV8.sol";

contract MoveDebtDelegate is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    /// @dev VToken return value signalling about successful execution
    uint256 internal constant NO_ERROR = 0;

    /// @notice VToken to repay the debt to
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVBep20 public immutable vTokenToRepay;

    /// @notice Emitted if debt is swapped successfully
    event DebtMoved(
        address indexed originalBorrower,
        address vTokenRepaid,
        uint256 repaidAmount,
        address indexed newBorrower,
        address indexed vTokenBorrowed,
        uint256 borrowedAmount
    );

    /// @notice Emitted when the owner transfers tokens, accidentially sent to this contract,
    ///   to their account
    event SweptTokens(address indexed token, uint256 amount);

    /// @notice Thrown if VTokens' comptrollers are not equal
    error ComptrollerMismatch();

    /// @notice Thrown if repayment fails with an error code
    error RepaymentFailed(uint256 errorCode);

    /// @notice Thrown if borrow fails with an error code
    error BorrowFailed(uint256 errorCode);

    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Constructor for the implementation contract. Sets immutable variables.
    /// @param vTokenToRepay_ VToken to repay the debt to
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IVBep20 vTokenToRepay_) {
        vTokenToRepay = vTokenToRepay_;
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable2Step_init();
        __ReentrancyGuard_init();
    }

    /**
     * @notice Repays originalBorrower's borrow in vTokenToRepay.underlying() and borrows
     *   vTokenToBorrow.underlying() on behalf of newBorrower
     * @param originalBorrower The address of the borrower, whose debt to repay
     * @param repayAmount The amount to repay in terms of vTokenToRepay.underlying()
     * @param newBorrower The address of the borrower, who will own the new borrow
     * @param vTokenToBorrow VToken to borrow from
     */
    function moveDebt(
        address originalBorrower,
        uint256 repayAmount,
        address newBorrower,
        IVBep20 vTokenToBorrow
    ) external onlyOwner nonReentrant {
        uint256 actualRepaymentAmount = _repay(vTokenToRepay, originalBorrower, repayAmount);
        uint256 amountToBorrow = _convert(vTokenToRepay, vTokenToBorrow, actualRepaymentAmount);
        _borrow(vTokenToBorrow, newBorrower, amountToBorrow);
        emit DebtMoved(
            originalBorrower,
            address(vTokenToRepay),
            actualRepaymentAmount,
            newBorrower,
            address(vTokenToBorrow),
            amountToBorrow
        );
    }

    /**
     * @notice Transfers tokens, accidentially sent to this contract, to the owner
     * @param token ERC-20 token to sweep
     */
    function sweepTokens(IERC20Upgradeable token) external onlyOwner {
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(owner(), amount);
        emit SweptTokens(address(token), amount);
    }

    /**
     * @dev Transfers the funds from the sender and repays a borrow in vToken on behalf of the borrower
     * @param vToken VToken to repay the debt to
     * @param borrower The address of the borrower, whose debt to repay
     * @param repayAmount The amount to repay in terms of underlying
     */
    function _repay(
        IVBep20 vToken,
        address borrower,
        uint256 repayAmount
    ) internal returns (uint256 actualRepaymentAmount) {
        IERC20Upgradeable underlying = IERC20Upgradeable(vToken.underlying());
        uint256 balanceBefore = underlying.balanceOf(address(this));
        underlying.safeTransferFrom(msg.sender, address(this), repayAmount);
        uint256 balanceAfter = underlying.balanceOf(address(this));
        uint256 repayAmountMinusFee = balanceAfter - balanceBefore;

        uint256 borrowBalanceBefore = vToken.borrowBalanceCurrent(borrower);
        approveOrRevert(underlying, address(vToken), repayAmountMinusFee);
        uint256 err = vToken.repayBorrowBehalf(borrower, repayAmountMinusFee);
        if (err != NO_ERROR) {
            revert RepaymentFailed(err);
        }
        approveOrRevert(underlying, address(vToken), 0);
        uint256 borrowBalanceAfter = vToken.borrowBalanceCurrent(borrower);
        return borrowBalanceBefore - borrowBalanceAfter;
    }

    /**
     * @dev Borrows in vToken on behalf of the borrower and transfers the funds to the sender
     * @param vToken VToken to borrow from
     * @param borrower The address of the borrower, who will own the borrow
     * @param borrowAmount The amount to borrow in terms of underlying
     */
    function _borrow(IVBep20 vToken, address borrower, uint256 borrowAmount) internal {
        IERC20Upgradeable underlying = IERC20Upgradeable(vToken.underlying());
        uint256 balanceBefore = underlying.balanceOf(address(this));
        uint256 err = vToken.borrowBehalf(borrower, borrowAmount);
        if (err != NO_ERROR) {
            revert BorrowFailed(err);
        }
        uint256 balanceAfter = underlying.balanceOf(address(this));
        uint256 actualBorrowedAmount = balanceAfter - balanceBefore;
        underlying.safeTransfer(msg.sender, actualBorrowedAmount);
    }

    /**
     * @dev Converts the value expressed in convertFrom.underlying() to a value
     *   in convertTo.underlying(), using the oracle price
     * @param convertFrom VToken to convert from
     * @param convertTo VToken to convert to
     * @param amount The amount in convertFrom.underlying()
     */
    function _convert(IVBep20 convertFrom, IVBep20 convertTo, uint256 amount) internal view returns (uint256) {
        IComptroller comptroller = convertFrom.comptroller();
        if (comptroller != convertTo.comptroller()) {
            revert ComptrollerMismatch();
        }
        ResilientOracleInterface oracle = comptroller.oracle();

        // Decimals are accounted for in the oracle contract
        uint256 scaledUsdValue = oracle.getUnderlyingPrice(address(convertFrom)) * amount; // the USD value here has 36 decimals
        return scaledUsdValue / oracle.getUnderlyingPrice(address(convertTo));
    }
}
