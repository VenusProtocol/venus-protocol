// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

/**
 * @title IMultichainVoteRegistry
 * @author Venus
 * @notice Interface implemented by `MultichainVoteRegistry`
 */
interface IMultichainVoteRegistry {
    /**
     * @notice Synchronizes remote chain votes for a specific delegatee
     * @param chainId The Id of the remote chain where votes are being synchronized
     * @param delegatee The address of the delegatee whose votes are being synchronized
     * @param checkpoint The checkpoint for the delegatee's votes
     * @param votes The total number of votes to be synchronized
     * @param nCheckpoint The number of checkpoints for each account
     */
    function syncDestVotes(
        uint16 chainId,
        address delegatee,
        uint32 checkpoint,
        uint32 nCheckpoint,
        uint96 votes
    ) external;
}
