// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

contract MultichainVoteRegistry {
    /**
     * @notice Access Control Manager
     */
    IAccessControlManagerV8 public accessControlManager;

    /**
     * @notice A checkpoint for marking number of votes from a given block
     */
    struct Checkpoint {
        uint32 fromBlock;
        uint96 votes;
    }
    /**
     * @notice Total number of votes irrespect of chain id
     */
    mapping(address => mapping(uint32 => Checkpoint)) public checkpoint;

    /**
     * @notice A record of votes checkpoints for each account, by chain id and index
     */
    mapping(uint64 => mapping(address => mapping(uint32 => Checkpoint))) public checkpointsWithChainId;

    /**
     * @notice Emitted when user's votes updated
     */
    event DestVotesUpdated(uint16 chainId, address delegatee, uint32 checkpoints, uint96 votes);

    constructor(IAccessControlManagerV8 _accessControlManager) {
        accessControlManager = _accessControlManager;
    }

    /**
     * @notice Update votes of user
     * @param chainId  Chain id on which votes are staked
     * @param delegatee  The address to delegate votes to
     * @param checkpoints Checkpoints of user
     * @param votes Number of votes
     * @custom:access Controlled by Access Control Manager
     * @custom:event Emit DestVotesUpdated
     */

    function updateVotes(uint16 chainId, address delegatee, uint32 checkpoints, uint96 votes) external {
        require(
            IAccessControlManagerV8(accessControlManager).isAllowedToCall(
                msg.sender,
                "updateVotes(uint16,address,uint32,uint96)"
            ),
            "access denied"
        );
        uint32 blockNumber = safe32(block.number, "MultichainVoteRegistry: block number exceeds 32 bits");
        checkpoint[delegatee][checkpoints] = Checkpoint(blockNumber, votes);
        checkpointsWithChainId[chainId][delegatee][checkpoints] = Checkpoint({ fromBlock: blockNumber, votes: votes });
        emit DestVotesUpdated(chainId, delegatee, checkpoints, votes);
    }

    /**
     * @dev Safely converts an unsigned integer to a 32-bit unsigned integer
     * @param n The unsigned integer to be converted
     * @param errorMessage Error message to be used if the conversion overflows
     * @return The result of the conversion as a 32-bit unsigned integer
     */
    function safe32(uint n, string memory errorMessage) internal pure returns (uint32) {
        require(n < 2 ** 32, errorMessage);
        return uint32(n);
    }
}
