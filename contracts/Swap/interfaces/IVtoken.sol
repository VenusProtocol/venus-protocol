// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.13;

interface IVToken {
    function mintBehalf(address receiver, uint mintAmount) external returns (uint);

    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);

    function borrowBalanceCurrent(address account) external returns (uint);

    function borrowBehalf(address borrower, uint256 borrowAmount) external returns (uint256);

    function underlying() external returns (address);

    function exchangeRateCurrent() external returns (uint256);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function redeem(uint256 redeemTokens) external returns (uint256);
}
