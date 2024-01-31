// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

interface IMultichainVoteRegistry {
    /**
     * @notice Update votes of user
     * @param chainId  Chain id on which votes are staked
     * @param delegatee  The address to delegate votes to
     * @param checkpoints Checkpoints of user
     * @param votes Number of votes
     */
    function updateVotes(uint16 chainId, address delegatee, uint32 checkpoints, uint96 votes) external;
}
