// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

/**
 * @title IPrime
 * @author Venus
 * @notice Interface for Prime Token
 */
interface IPrime {
    /**
     * @notice Executed by XVSVault whenever user's XVSVault balance changes
     * @param user the account address whose balance was updated
     */
    function xvsUpdated(address user) external;

    /**
     * @notice accrues interest and updates score for an user for a specific market
     * @param user the account address for which to accrue interest and update score
     * @param market the market for which to accrue interest and update score
     */
    function accrueInterestAndUpdateScore(address user, address market) external;

    /**
     * @notice Distributes income from market since last distribution
     * @param vToken the market for which to distribute the income
     */
    function accrueInterest(address vToken) external;

    /**
     * @notice Returns if user is a prime holder
     * @param isPrimeHolder returns if the user is a prime holder
     */
    function isUserPrimeHolder(address user) external view returns (bool isPrimeHolder);
}
