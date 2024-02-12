// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IXVSVault } from "./IXVSVault.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

/**
 * @title MultichainVoteRegistry
 * @author Venus
 * @notice The MultichainVoteRegistry contract is access controlled which keeps the count of the votes on the basis of chainId.
 * This contract is responsible for providing the final accumulated voting power (on all supported chains) to the governanceDelegate contract when voting on a proposal.
 * It is invoked by layerZero bridge receiver contract to update the vote state/checkpoint for accounts that have staked on chains apart from BSC.
 */
contract MultichainVoteRegistry is AccessControlledV8 {
    /**
     * @notice A checkpoint for marking number of votes from a given block
     */
    struct Checkpoint {
        uint32 fromBlock;
        uint96 votes;
    }

    /**
     * @notice Address of XVSVault deployed on BSC chain
     */
    IXVSVault public immutable XVSVault;
    /**
     * @notice The number of checkpoints for each account
     */
    mapping(address => uint32) public numCheckpoints;

    /**
     * @notice Total number of votes irrespect of chain id
     */
    mapping(address => mapping(uint32 => Checkpoint)) public checkpoints;

    /**
     * @notice A record of votes checkpoints for each account, by chain id and index
     */
    mapping(uint16 => mapping(address => mapping(uint32 => Checkpoint))) public checkpointsWithChainId;

    /**
     * @notice Emitted when user's votes updated
     */
    event DestVotesUpdated(
        uint16 indexed chainId,
        address delegatee,
        uint32 checkpoints,
        uint32 blockNumber,
        uint96 votes,
        uint32 nCheckpoint
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IXVSVault XVSVault_) {
        ensureNonzeroAddress(address(XVSVault_));
        XVSVault = XVSVault_;
    }

    /**
     * @notice Initialize the contract
     * @param accessControlManager_ Address of access control manager
     */
    function initialize(address accessControlManager_) external initializer {
        ensureNonzeroAddress(accessControlManager_);
        __AccessControlled_init(accessControlManager_);
    }

    /**
     * @notice Synchronizes remote chain votes(amount of XVS stake) for a specific delegatee
     * @param chainId The Id of the remote chain where votes are being synchronized
     * @param delegatee The address of the delegatee whose votes are being synchronized
     * @param checkpoint The number of checkpoints for the delegatee's votes
     * @param votes The total number of votes to be synchronized
     * @param nCheckpoint The number of checkpoints for each account
     * @custom:access Controlled by Access Control Manager
     * @custom:event Emit DestVotesUpdated
     */

    function syncDestVotes(
        uint16 chainId,
        address delegatee,
        uint32 checkpoint,
        uint96 votes,
        uint32 nCheckpoint
    ) external {
        _checkAccessAllowed("syncDestVotes(uint16,address,uint32,uint96,uint32)");
        uint32 blockNumber = uint32(block.number);
        Checkpoint memory newCheckpoint = Checkpoint(blockNumber, votes);
        checkpoints[delegatee][checkpoint] = newCheckpoint;
        checkpointsWithChainId[chainId][delegatee][checkpoint] = newCheckpoint;
        numCheckpoints[delegatee] = nCheckpoint;
        emit DestVotesUpdated(chainId, delegatee, checkpoint, blockNumber, votes, nCheckpoint);
    }

    /**
     * @notice Determine the xvs stake balance for an account
     * @param account The address of the account to check
     * @param blockNumber The block number to get the vote balance at
     * @return The balance that user staked
     */
    function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96) {
        require(blockNumber < block.number, "MultichainVoteRegistry::getPriorVotes: not yet determined");
      
        // Fetch votes of user stored in XVSVault on BSC chain
        uint96 votesOnBnb = XVSVault.getPriorVotes(account, blockNumber);

        uint32 nCheckpoints = numCheckpoints[account];
        if (nCheckpoints == 0) {
            return 0 + votesOnBnb;
        }

        // First check most recent balance
        if (checkpoints[account][nCheckpoints - 1].fromBlock <= blockNumber) {
            return checkpoints[account][nCheckpoints - 1].votes + votesOnBnb;
        }

        // Next check implicit zero balance
        if (checkpoints[account][0].fromBlock > blockNumber) {
            return 0;
        }

        uint32 lower = 0;
        uint32 upper = nCheckpoints - 1;
        while (upper > lower) {
            uint32 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
            Checkpoint memory cp = checkpoints[account][center];
            if (cp.fromBlock == blockNumber) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        //return accumulated votes
        return checkpoints[account][lower].votes + votesOnBnb;
    }
}
