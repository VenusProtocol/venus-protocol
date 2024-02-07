// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IVToken {
    function borrowBalanceStored(address account) external view returns (uint256);

    function exchangeRateStored() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function underlying() external view returns (address);

    function totalBorrows() external view returns (uint256);

    function borrowRatePerBlock() external view returns (uint256);

    function reserveFactorMantissa() external view returns (uint256);

    function decimals() external view returns (uint8);
}
