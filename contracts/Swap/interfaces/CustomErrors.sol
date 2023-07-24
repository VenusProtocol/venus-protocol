// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.13;
// **************
// *** ERRORS ***
// **************

///@notice Error indicating that suplying to a given market failed.
error SupplyError(address supplier, address vToken, uint256 errorCode);

///@notice Error indicating that repaying to given market failed.
error RepayError(address repayer, address vToken, uint256 errorCode);

///@notice Error indicating wBNB address passed is not the expected one.
error WrongAddress(address expectedAdddress, address passedAddress);

///@notice Error thrown when deadline for swap has expired
error SwapDeadlineExpire(uint256 deadline, uint256 timestemp);

///@notice Error thrown where the input amount parameter for a token is 0
error InsufficientInputAmount();

///@notice Error thrown when the amount out passed is 0
error InsufficientOutputAmount();

///@notice Error thrown when the amount received from a trade is below the minimum
error OutputAmountBelowMinimum(uint256 amountOut, uint256 amountOutMin);

///@notice Error thrown when the amount In is above the amount in maximum
error InputAmountAboveMaximum(uint256 amountIn, uint256 amountIntMax);

///@notice Error thrown when amount is above the msg.value(amountMax)
error ExcessiveInputAmount(uint256 amount, uint256 amountMax);

///@notice Error thrown when the given reserves are equal to 0
error InsufficientLiquidity();

///@notice Error thrown if a zero address is passed
error ZeroAddress();

///@notice Error thrown if two token addresses are identical
error IdenticalAddresses();

///@notice Error thrown when the trade path[] parameter consists of only 1 token (i.e. path.length<2)
error InvalidPath();

///@notice Error thrown when invalid vToken address is passed to swap router
error VTokenNotListed(address vToken);

///@notice Error thrown when invalid underlying is passed as per given vToken
error VTokenUnderlyingInvalid(address underlying);

///@notice Error thrown when swapamount is less than the amountOutmin
error SwapAmountLessThanAmountOutMin(uint256 swapAmount, uint256 amountOutMin);

///@notice Error thrown when swapRouter's balance is less than sweep amount
error InsufficientBalance(uint256 sweepAmount, uint256 balance);

///@notice Error thrown when safeApprove failed
error SafeApproveFailed();

///@notice Error thrown when safeTransfer failed
error SafeTransferFailed();

///@notice Error thrown when transferFrom failed
error SafeTransferFromFailed();

///@notice Error thrown when safeTransferBNB failed
error SafeTransferBNBFailed();

///@notice Error thrown when reentrant check fails
error ReentrantCheck();
