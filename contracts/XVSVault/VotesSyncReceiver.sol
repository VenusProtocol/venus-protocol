// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { NonblockingLzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { ExcessivelySafeCall } from "@layerzerolabs/solidity-examples/contracts/libraries/ExcessivelySafeCall.sol";
import { IMultichainVoteRegistry } from "./IMultichainVoteRegistry.sol";

/**
 * @title VotesSyncReceiver
 * @author Venus
 * @notice The VotesSyncReceiver is builds upon the functionality of its parent contract, NonblockingLzApp which is part of layer zero bridge. It receives voting information in the form of payload from remote(non-BSC) chains and send that information to MultichainVoteRegistry.
 */ 
contract VotesSyncReceiver is Pausable, NonblockingLzApp {
    using ExcessivelySafeCall for address;

    /**
     * @notice Multichain vote registry.
     */
    IMultichainVoteRegistry public multichainVoteRegistry;

    /**
     * @notice Event emitted when trusted remote sets to empty.
     */
    event TrustedRemoteRemoved(uint16 indexed chainId);

    /**
     * @notice Event emitted when call failed
     */
    event ReceivePayloadFailed(uint16 indexed remoteChainId, bytes remoteAddress, uint64 nonce, bytes reason);

    /**
     * @notice Event emitted when votes synced
     */
    event VotesSynced(address indexed delegatee, uint32 checkpoints, uint96  indexed votes, uint32 nCheckpoint);

    constructor(address endpoint_, IMultichainVoteRegistry multichainVoteRegistry_) NonblockingLzApp(endpoint_) {
        ensureNonzeroAddress(address(multichainVoteRegistry_));
        ensureNonzeroAddress(endpoint_);
        multichainVoteRegistry = multichainVoteRegistry_;
    }

    /**
     * @notice Remove trusted remote from storage
     * @param remoteChainId Remote chain Id .
     * @custom:access Only owner
     * @custom:event Emit TrustedRemoteRemoved with remote chain id
     */
    function removeTrustedRemote(uint16 remoteChainId) external onlyOwner {
        delete trustedRemoteLookup[remoteChainId];
        emit TrustedRemoteRemoved(remoteChainId);
    }

    /**
     * @notice Process blocking LayerZero receive request
     * @param remoteChainId Remote chain Id
     * @param remoteAddress Remote address from which payload is received
     * @param nonce Nonce associated with the payload to prevent replay attacks
     * @param payload Encoded payload containing votes information
     * @custom:event Emit ReceivePayloadFailed if call fails
     */
    function _blockingLzReceive(
        uint16 remoteChainId,
        bytes memory remoteAddress,
        uint64 nonce,
        bytes memory payload
    ) internal virtual override whenNotPaused {
        uint256 gasToStoreAndEmit = 30000; // enough gas to ensure we can store the payload and emit the event

        (bool success, bytes memory reason) = address(this).excessivelySafeCall(
            gasleft() - gasToStoreAndEmit,
            150,
            abi.encodeCall(this.nonblockingLzReceive, (remoteChainId, remoteAddress, nonce, payload))
        );
        // try-catch all errors/exceptions
        if (!success) {
            bytes32 hashedPayload = keccak256(payload);
            failedMessages[remoteChainId][remoteAddress][nonce] = hashedPayload;
            emit ReceivePayloadFailed(remoteChainId, remoteAddress, nonce, reason); // Retrieve payload from the src side tx if needed to clear
        }
    }

    /**
     * @notice Process non blocking LayerZero receive request
     * @param remoteChainId Remote chain id
     * @param payload Encoded payload containing votes information: abi.encode(delegatee, ncheckpoints, votes)
     */
    function _nonblockingLzReceive(
        uint16 remoteChainId,
        bytes memory,
        uint64,
        bytes memory payload
    ) internal virtual override {
        (address delegatee, uint32 checkpoints, uint96 votes) = abi.decode(
            payload,
            (address, uint32, uint96)
        );
        multichainVoteRegistry.syncDestVotes(remoteChainId, delegatee, checkpoints, votes, checkpoints + 1);
        emit VotesSynced(delegatee, checkpoints,votes, checkpoints + 1);
    }
}
