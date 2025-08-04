// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "./IVToken.sol";

interface IVBep20 is IVToken {
    /*** User Interface ***/

    function mint(uint mintAmount) external returns (uint);

    function mintBehalf(address receiver, uint mintAmount) external returns (uint);

    function redeem(uint redeemTokens) external returns (uint);

    function redeemUnderlying(uint redeemAmount) external returns (uint);

    function borrow(uint borrowAmount) external returns (uint);

    function repayBorrow(uint repayAmount) external returns (uint);

    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);

    function liquidateBorrow(
        address borrower,
        uint repayAmount,
        IVToken vTokenCollateral
    ) external returns (uint);

    /*** Admin Functions ***/

    function _addReserves(uint addAmount) external returns (uint);
}
