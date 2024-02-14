// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

/**
 * @title IXVSVault
 * @author Venus
 * @notice Interface implemented by `XVSVault`
 */
interface IXVSVault {
    /**
     * @notice Determine the xvs stake balance for an account on BSC chain
     * @param account The address of the account to check
     * @param blockNumber The block number to get the vote balance at
     * @return The balance that user staked on BSC chain
     */
    function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96);
}
