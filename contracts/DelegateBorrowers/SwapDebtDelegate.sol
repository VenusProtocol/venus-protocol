// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPriceOracle {
    function getUnderlyingPrice(IVToken vToken) external view returns (uint256);
}

interface IComptroller {
    function oracle() external view returns (IPriceOracle);
}

interface IVToken {
    function borrowBehalf(address borrower, uint256 borrowAmount) external returns (uint256);

    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);

    function borrowBalanceCurrent(address account) external returns (uint256);

    function comptroller() external view returns (IComptroller);

    function underlying() external view returns (address);
}

contract SwapDebtDelegate is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    /// @dev VToken return value signalling about successful execution
    uint256 internal constant NO_ERROR = 0;

    /// @notice Emitted if debt is swapped successfully
    event DebtSwapped(
        address indexed borrower,
        address indexed vTokenRepaid,
        uint256 repaidAmount,
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

    function initialize() external initializer {
        __Ownable2Step_init();
        __ReentrancyGuard_init();
    }

    /**
     * @notice Repays a borrow in repayTo.underlying() and borrows borrowFrom.underlying()
     * @param borrower The address of the borrower, whose debt to swap
     * @param repayTo VToken to repay the debt to
     * @param borrowFrom VToken to borrow from
     * @param repayAmount The amount to repay in terms of repayTo.underlying()
     */
    function swapDebt(
        address borrower,
        IVToken repayTo,
        IVToken borrowFrom,
        uint256 repayAmount
    ) external onlyOwner nonReentrant {
        uint256 actualRepaymentAmount = _repay(repayTo, borrower, repayAmount);
        uint256 amountToBorrow = _convert(repayTo, borrowFrom, actualRepaymentAmount);
        _borrow(borrowFrom, borrower, amountToBorrow);
        emit DebtSwapped(borrower, address(repayTo), actualRepaymentAmount, address(borrowFrom), amountToBorrow);
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
        IVToken vToken,
        address borrower,
        uint256 repayAmount
    ) internal returns (uint256 actualRepaymentAmount) {
        IERC20Upgradeable underlying = IERC20Upgradeable(vToken.underlying());
        uint256 balanceBefore = underlying.balanceOf(address(this));
        underlying.safeTransferFrom(msg.sender, address(this), repayAmount);
        uint256 balanceAfter = underlying.balanceOf(address(this));
        uint256 repayAmountMinusFee = balanceAfter - balanceBefore;

        underlying.safeApprove(address(vToken), 0);
        underlying.safeApprove(address(vToken), repayAmountMinusFee);
        uint256 borrowBalanceBefore = vToken.borrowBalanceCurrent(borrower);
        uint256 err = vToken.repayBorrowBehalf(borrower, repayAmountMinusFee);
        if (err != NO_ERROR) {
            revert RepaymentFailed(err);
        }
        uint256 borrowBalanceAfter = vToken.borrowBalanceCurrent(borrower);
        return borrowBalanceBefore - borrowBalanceAfter;
    }

    /**
     * @dev Borrows in vToken on behalf of the borrower and transfers the funds to the sender
     * @param vToken VToken to borrow from
     * @param borrower The address of the borrower, who will own the borrow
     * @param borrowAmount The amount to borrow in terms of underlying
     */
    function _borrow(IVToken vToken, address borrower, uint256 borrowAmount) internal {
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
    function _convert(IVToken convertFrom, IVToken convertTo, uint256 amount) internal view returns (uint256) {
        IComptroller comptroller = convertFrom.comptroller();
        if (comptroller != convertTo.comptroller()) {
            revert ComptrollerMismatch();
        }
        IPriceOracle oracle = comptroller.oracle();

        // Decimals are accounted for in the oracle contract
        uint256 scaledUsdValue = oracle.getUnderlyingPrice(convertFrom) * amount; // the USD value here has 36 decimals
        return scaledUsdValue / oracle.getUnderlyingPrice(convertTo);
    }
}
