// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;

interface IPrime {
    function xvsUpdated(address user) external;

    function accrueInterestAndUpdateScore(address user, address market) external;

    function accrueInterest(address vToken) external;
}
