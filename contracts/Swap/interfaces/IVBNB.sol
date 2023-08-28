// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.13;

interface IVBNB {
    function repayBorrowBehalf(address borrower) external payable;

    function mint() external payable;

    function balanceOf(address owner) external view returns (uint256);
}
