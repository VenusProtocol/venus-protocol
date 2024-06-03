// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { IVAIController, IVToken, IVBep20, IVBNB } from "../InterfacesV8.sol";
import { Currency, CurrencyLibrary } from "../lib/Currency.sol";

contract TokenRedeemer is ReentrancyGuard, Ownable2Step {
    using CurrencyLibrary for Currency;

    struct Repayment {
        address borrower;
        uint256 amount;
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

    function redeemUnderlyingAndTransfer(
        IVToken vToken,
        address destination,
        uint256 amount,
        address receiver
    ) external nonReentrant onlyOwner {
        Currency underlying = _underlying(vToken);
        underlying.transferAll(receiver); // Just in case there were some underlying tokens on the contract
        uint256 err = vToken.redeemUnderlying(amount);
        if (err != 0) {
            revert RedeemFailed(err);
        }
        underlying.transferAll(destination);
        Currency.wrap(address(vToken)).transferAll(receiver);
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
        Repayment[] calldata requestedRepayments,
        address receiver
    ) external nonReentrant onlyOwner {
        _accrueInterest(vToken);

        (uint256 totalBorrowedAmount, Repayment[] memory repayments) = _getAmountsToRepay(vToken, requestedRepayments);
        _redeemUpTo(vToken, totalBorrowedAmount);

        Currency underlying = _underlying(vToken);
        uint256 balance = underlying.balanceOfSelf();
        underlying.approve(address(vToken), totalBorrowedAmount);
        uint256 repaymentsCount = repayments.length;
        // The code below assumes no fees on transfer
        if (balance >= totalBorrowedAmount) {
            // If we're doing a full repayment, we can optimize it by skipping the balance checks
            for (uint256 i = 0; i < repaymentsCount; ++i) {
                Repayment memory repayment = repayments[i];
                _repay(vToken, repayment.borrower, repayment.amount);
            }
        } else {
            // Otherwise, we have to check and update the balance on every iteration
            for (uint256 i = 0; i < repaymentsCount && balance != 0; ++i) {
                Repayment memory repayment = repayments[i];
                _repay(vToken, repayment.borrower, _min(repayment.amount, balance));
                balance = underlying.balanceOfSelf();
            }
        }
        underlying.approve(address(vToken), 0);

        underlying.transferAll(receiver);
        Currency.wrap(address(vToken)).transferAll(receiver);
    }

    function batchRepayVAI(
        IVAIController vaiController,
        Repayment[] calldata requestedRepayments,
        address receiver
    ) external nonReentrant onlyOwner {
        vaiController.accrueVAIInterest();
        Currency vai = Currency.wrap(vaiController.getVAIAddress());
        uint256 balance = vai.balanceOfSelf();
        vai.approve(address(vaiController), type(uint256).max);
        uint256 repaymentsCount = requestedRepayments.length;
        for (uint256 i = 0; i < repaymentsCount && balance != 0; ++i) {
            Repayment calldata requestedRepayment = requestedRepayments[i];
            uint256 repaymentCap = requestedRepayment.amount;
            uint256 debt = vaiController.getVAIRepayAmount(requestedRepayment.borrower);
            uint256 amount = _min(repaymentCap, debt);
            _repayVAI(vaiController, requestedRepayment.borrower, _min(amount, balance));
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

    function _getAmountsToRepay(
        IVToken vToken,
        Repayment[] calldata requestedRepayments
    ) internal view returns (uint256, Repayment[] memory) {
        uint256 repaymentsCount = requestedRepayments.length;
        Repayment[] memory actualRepayments = new Repayment[](repaymentsCount);
        uint256 totalAmountToRepay = 0;
        for (uint256 i = 0; i < repaymentsCount; ++i) {
            Repayment calldata requestedRepayment = requestedRepayments[i];
            uint256 repaymentCap = requestedRepayment.amount;
            uint256 debt = vToken.borrowBalanceStored(requestedRepayment.borrower);
            uint256 amountToRepay = _min(repaymentCap, debt);
            totalAmountToRepay += amountToRepay;
            actualRepayments[i] = Repayment({ borrower: requestedRepayment.borrower, amount: amountToRepay });
        }
        return (totalAmountToRepay, actualRepayments);
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
