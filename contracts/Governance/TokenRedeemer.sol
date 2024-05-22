// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { IVAIController, IVToken, IVBep20, IVBNB } from "../InterfacesV8.sol";
import { Currency, CurrencyLibrary } from "../lib/Currency.sol";

contract TokenRedeemer is ReentrancyGuard, Ownable2Step {
    using CurrencyLibrary for Currency;

    struct AccountBorrows {
        address borrower;
        uint256 amount;
    }

    struct Borrows {
        uint256 totalBorrows;
        AccountBorrows[] accountBorrows;
    }

    IVBNB public immutable VBNB;

    error AccrueInterestFailed(uint256 errCode);
    error RedeemFailed(uint256 errCode);
    error RepaymentFailed(uint256 errCode);
    error NativeTokenTransferFailed();

    constructor(address owner_, IVBNB vBNB) {
        ensureNonzeroAddress(owner_);
        VBNB = vBNB;
        _transferOwnership(owner_);
    }

    receive() external payable {}

    function redeemAndTransfer(IVToken vToken, address destination) external nonReentrant onlyOwner {
        Currency underlying = _underlying(vToken);
        uint256 err = vToken.redeem(vToken.balanceOf(address(this)));
        if (err != 0) {
            revert RedeemFailed(err);
        }
        underlying.transferAll(destination);
    }

    function redeemUnderlyingAndRepayBorrowBehalf(
        IVToken vToken,
        address borrower,
        uint256 amount,
        address receiver
    ) external nonReentrant onlyOwner {
        Currency underlying = _underlying(vToken);

        uint256 err = vToken.redeemUnderlying(amount);
        if (err != 0) {
            revert RedeemFailed(err);
        }

        underlying.approve(address(vToken), amount);

        _repay(vToken, borrower, amount);

        underlying.approve(address(vToken), 0);

        underlying.transferAll(receiver);
        Currency.wrap(address(vToken)).transferAll(receiver);
    }

    function redeemAndBatchRepay(
        IVToken vToken,
        address[] calldata borrowers,
        address receiver
    ) external nonReentrant onlyOwner {
        _accrueInterest(vToken);

        (uint256 totalBorrowedAmount, AccountBorrows[] memory borrows) = _getBorrows(vToken, borrowers);
        _redeemUpTo(vToken, totalBorrowedAmount);

        Currency underlying = _underlying(vToken);
        uint256 balance = underlying.balanceOfSelf();
        underlying.approve(address(vToken), totalBorrowedAmount);
        uint256 borrowsCount = borrows.length;
        // The code below assumes no fees on transfer
        if (balance >= totalBorrowedAmount) {
            // If we're doing a full repayment, we can optimize it by skipping the balance checks
            for (uint256 i = 0; i < borrowsCount; ++i) {
                AccountBorrows memory accountBorrows = borrows[i];
                _repay(vToken, accountBorrows.borrower, accountBorrows.amount);
            }
        } else {
            // Otherwise, we have to check and update the balance on every iteration
            for (uint256 i = 0; i < borrowsCount && balance != 0; ++i) {
                AccountBorrows memory accountBorrows = borrows[i];
                _repay(vToken, accountBorrows.borrower, _min(accountBorrows.amount, balance));
                balance = underlying.balanceOfSelf();
            }
        }
        underlying.approve(address(vToken), 0);

        underlying.transferAll(receiver);
        Currency.wrap(address(vToken)).transferAll(receiver);
    }

    function batchRepayVAI(
        IVAIController vaiController,
        address[] calldata borrowers,
        address receiver
    ) external nonReentrant onlyOwner {
        vaiController.accrueVAIInterest();
        Currency vai = Currency.wrap(vaiController.getVAIAddress());
        uint256 balance = vai.balanceOfSelf();
        vai.approve(address(vaiController), type(uint256).max);
        uint256 borrowersCount = borrowers.length;
        for (uint256 i = 0; i < borrowersCount && balance != 0; ++i) {
            address borrower = borrowers[i];
            uint256 debt = vaiController.getVAIRepayAmount(borrower);
            _repayVAI(vaiController, borrower, _min(debt, balance));
            balance = vai.balanceOfSelf();
        }
        vai.approve(address(vaiController), 0);
        vai.transferAll(receiver);
    }

    function sweepTokens(address token, address destination) external onlyOwner {
        Currency.wrap(token).transferAll(destination);
    }

    function _accrueInterest(IVToken vToken) internal {
        uint256 err = vToken.accrueInterest();
        if (err != 0) {
            revert AccrueInterestFailed(err);
        }
    }

    function _redeemUpTo(IVToken vToken, uint256 amount) internal {
        uint256 unredeemedUnderlying = vToken.balanceOfUnderlying(address(this));
        if (unredeemedUnderlying > 0) {
            uint256 err = vToken.redeemUnderlying(_min(amount, unredeemedUnderlying));
            if (err != 0) {
                revert RedeemFailed(err);
            }
        }
    }

    function _repay(IVToken vToken, address borrower, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        if (_isVBNB(vToken)) {
            IVBNB(address(vToken)).repayBorrowBehalf{ value: amount }(borrower);
        } else {
            uint256 err = IVBep20(address(vToken)).repayBorrowBehalf(borrower, amount);
            if (err != 0) {
                revert RepaymentFailed(err);
            }
        }
    }

    function _repayVAI(IVAIController vaiController, address borrower, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        (uint256 err, ) = vaiController.repayVAIBehalf(borrower, amount);
        if (err != 0) {
            revert RepaymentFailed(err);
        }
    }

    function _getBorrows(
        IVToken vToken,
        address[] calldata borrowers
    ) internal view returns (uint256, AccountBorrows[] memory) {
        uint256 borrowersCount = borrowers.length;
        AccountBorrows[] memory borrows = new AccountBorrows[](borrowersCount);
        uint256 totalBorrowedAmount = 0;
        for (uint256 i = 0; i < borrowers.length; ++i) {
            address borrower = borrowers[i];
            uint256 amount = vToken.borrowBalanceStored(borrower);
            totalBorrowedAmount += amount;
            borrows[i] = AccountBorrows({ borrower: borrower, amount: amount });
        }
        return (totalBorrowedAmount, borrows);
    }

    function _underlying(IVToken vToken) internal view returns (Currency) {
        if (_isVBNB(vToken)) {
            return CurrencyLibrary.NATIVE;
        }
        return Currency.wrap(IVBep20(address(vToken)).underlying());
    }

    function _isVBNB(IVToken vToken) internal view returns (bool) {
        return address(vToken) == address(VBNB);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
