// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { IXVSVault } from "./interfaces/IXVSVault.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

/**
 * @title MultichainVoteRegistry
 * @author Venus
 * @notice The MultichainVoteRegistry contract is access controlled which keeps the count of the votes on the basis of chainId.
 * This contract is responsible for providing the final accumulated voting power (on all supported chains) to the governanceDelegate contract when voting on a proposal.
 * It is invoked by layerZero bridge receiver contract to update the vote state/checkpoint for accounts that have staked on chains apart from BNB.
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
     * @notice LZ chain Id for all supported networks
     */
    uint16[] public lzChainIds;

    /**
     * @notice Address of XVSVault deployed on BNB chain
     */
    IXVSVault public immutable XVSVault;
    /**
     * @notice The number of checkpoints for each account for each chain id
     */
    mapping(uint16 => mapping(address => uint32)) public numCheckpointsWithChainId;

    /**
     * @notice A record of votes checkpoints for each account, by chain id and index
     */
    mapping(uint16 => mapping(address => mapping(uint32 => Checkpoint))) public checkpointsWithChainId;

    /**
     * @notice Emitted when user's votes updated
     */
    event DestVotesUpdated(
        uint16 indexed chainId,
        address indexed delegatee,
        uint32 checkpoints,
        uint32 blockNumber,
        uint96 votes,
        uint32 nCheckpoint
    );
    /**
     * @notice Emitted when new chain Id is added to supported chain id list
     */
    event AddChainID(uint16 indexed chainId);
    /**
     * @notice Emitted when chain Id is removed from supported chain is list
     */
    event RemoveChainId(uint16 indexed chainId);

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
     * @notice Add chainId to supported layer zero chain ids
     * @param chainId_ Chain Id i.e. to be added
     * @custom:access Controlled by Access Control Manager
     * @custom:event Emit AddChainID with chain Id
     */
    function addChainId(uint16 chainId_) external {
        _checkAccessAllowed("addChainId(uint16)");
        require(chainId_ != 0, "MultichainVoteRegistry::addChainId: invalid chain Id");
        lzChainIds.push(chainId_);
        emit AddChainID(chainId_);
    }

    /**
     *@notice  Remove chain Id from supported layer zero chain ids
     * @param chainId_ Chain Id i.e. to be removed
     * @custom:access Controlled by Access Control Manager
     * @custom:event Emit RemoveChainId with chain Id
     */
    function removeChainId(uint16 chainId_) external {
        _checkAccessAllowed("removeChainId(uint16)");
        uint256 length = lzChainIds.length;
        uint256 index = length;
        for (uint256 i; i < length; ) {
            if (lzChainIds[i] == chainId_) {
                index = i;
            }
            unchecked {
                i++;
            }
        }
        require(index != length, "MultichainVoteRegistry::removeChainId: chain id not found");

        for (uint256 i = index; i < length - 1; ) {
            lzChainIds[i] = lzChainIds[i + 1];
            unchecked {
                i++;
            }
        }
        lzChainIds.pop();

        emit RemoveChainId(chainId_);
    }

    /**
     * @notice Synchronizes remote chain votes(amount of XVS stake) for a specific delegatee
     * @param chainId_ The Id of the remote chain where votes are being synchronized
     * @param delegatee_ The address of the delegatee whose votes are being synchronized
     * @param index_ Index for which votes to update
     * @param votes_ The total number of votes to be synchronized
     * @param nCheckpoint_ The number of checkpoints for each account
     * @custom:access Controlled by Access Control Manager
     * @custom:event Emit DestVotesUpdated
     */

    function syncDestVotes(
        uint16 chainId_,
        address delegatee_,
        uint32 index_,
        uint32 nCheckpoint_,
        uint96 votes_
    ) external {
        _checkAccessAllowed("syncDestVotes(uint16,address,uint32,uint96,uint32)");
        uint32 blockNumber = uint32(block.number);
        require(
            numCheckpointsWithChainId[chainId_][delegatee_] <= nCheckpoint_,
            "MultichainVoteRegistry::syncDestVotes: invalid checkpoint"
        );
        if (numCheckpointsWithChainId[chainId_][delegatee_] == nCheckpoint_) {
            require(
                checkpointsWithChainId[chainId_][delegatee_][index_].votes != votes_,
                "MultichainVoteRegistry::syncDestVotes: votes already updated"
            );
        }
        Checkpoint memory newCheckpoint = Checkpoint(blockNumber, votes_);
        checkpointsWithChainId[chainId_][delegatee_][index_] = newCheckpoint;
        numCheckpointsWithChainId[chainId_][delegatee_] = nCheckpoint_;

        emit DestVotesUpdated(chainId_, delegatee_, index_, blockNumber, votes_, nCheckpoint_);
    }

    /**
     * @notice Determine the xvs stake balance for an account
     * @param account_ The address of the account to check
     * @param blockNumber_ The block number to get the vote balance at
     * @return The balance that user staked
     */
    function getPriorVotes(address account_, uint256 blockNumber_) external view returns (uint96) {
        // Fetch votes of user stored in XVSVault on BNB chain
        uint96 votesOnBnb = XVSVault.getPriorVotes(account_, blockNumber_);
        uint96 totalVotes = votesOnBnb;
        uint256 length = lzChainIds.length;

        for (uint256 i; i < length; i++) {
            totalVotes += getPriorVotesInternal(account_, blockNumber_, lzChainIds[i]);
        }
        //return accumulated votes
        return totalVotes;
    }

    /**
     * @dev Internal function to determine the xvs stake balance for an account
     * @param account_ The address of the account to check
     * @param blockNumber_ The block number to get the vote balance at
     * @param chainId_ Layer zero chain id on which account balance will be checked
     * @return The balance that user staked on particular chain id
     */
    function getPriorVotesInternal(
        address account_,
        uint256 blockNumber_,
        uint16 chainId_
    ) internal view returns (uint96) {
        uint32 nCheckpoints = numCheckpointsWithChainId[chainId_][account_];
        if (nCheckpoints == 0) {
            return 0;
        }

        // First check most recent balance
        if (checkpointsWithChainId[chainId_][account_][nCheckpoints - 1].fromBlock <= blockNumber_) {
            return checkpointsWithChainId[chainId_][account_][nCheckpoints - 1].votes;
        }

        // Next check implicit zero balance
        if (checkpointsWithChainId[chainId_][account_][0].fromBlock > blockNumber_) {
            return 0;
        }

        uint32 lower = 0;
        uint32 upper = nCheckpoints - 1;
        while (upper > lower) {
            uint32 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
            Checkpoint memory cp = checkpointsWithChainId[chainId_][account_][center];
            if (cp.fromBlock == blockNumber_) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber_) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return checkpointsWithChainId[chainId_][account_][lower].votes;
    }
}
