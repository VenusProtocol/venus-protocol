// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

enum Action {
    MINT,
    REDEEM,
    BORROW,
    REPAY,
    SEIZE,
    LIQUIDATE,
    TRANSFER,
    ENTER_MARKET,
    EXIT_MARKET
}
