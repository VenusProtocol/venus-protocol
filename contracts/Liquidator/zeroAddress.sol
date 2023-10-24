// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

/// @notice Thrown if the argument is a zero address because probably it is a mistake
error UnexpectedZeroAddress();

function ensureNonzeroAddress(address address_) pure {
    if (address_ == address(0)) {
        revert UnexpectedZeroAddress();
    }
}
