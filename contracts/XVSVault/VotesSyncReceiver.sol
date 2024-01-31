// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;
import { NonblockingLzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { ExcessivelySafeCall } from "@layerzerolabs/solidity-examples/contracts/libraries/ExcessivelySafeCall.sol";
import { IMultichainVoteRegistry } from "./IMultichainVoteRegistry.sol";

/// @title A LayerZero example sending a cross chain message from a source chain to a destination chain to increment a counter
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
    event ReceivePayloadFailed(uint16 srcChainId, bytes srcAddress, uint64 nonce, bytes reason);

    /**
     * @notice Event emitted when votes synced
     */
    event VotesSynced(address delegatee, uint32 checkpoints, uint96 votes);

    constructor(address _endpoint, IMultichainVoteRegistry _multichainVoteRegistry) NonblockingLzApp(_endpoint) {
        ensureNonzeroAddress(address(_multichainVoteRegistry));
        multichainVoteRegistry = _multichainVoteRegistry;
    }

    /**
     * @notice Remove trusted remote from storage.
     * @param srcChainId Source chain Id.
     * @custom:access Only owner.
     * @custom:event Emit TrustedRemoteRemoved with source chain id.
     */
    function removeTrustedRemote(uint16 srcChainId) external onlyOwner {
        delete trustedRemoteLookup[srcChainId];
        emit TrustedRemoteRemoved(srcChainId);
    }

    /**
     * @notice Process blocking LayerZero receive request.
     * @param srcChainId_ Source chain Id.
     * @param srcAddress_ Source address from which payload is received.
     * @param nonce_ Nonce associated with the payload to prevent replay attacks.
     * @param payload_ Encoded payload containing votes information.
     * @custom:event Emit ReceivePayloadFailed if call fails.
     */
    function _blockingLzReceive(
        uint16 srcChainId_,
        bytes memory srcAddress_,
        uint64 nonce_,
        bytes memory payload_
    ) internal virtual override whenNotPaused {
        uint256 gasToStoreAndEmit = 30000; // enough gas to ensure we can store the payload and emit the event

        (bool success, bytes memory reason) = address(this).excessivelySafeCall(
            gasleft() - gasToStoreAndEmit,
            150,
            abi.encodeCall(this.nonblockingLzReceive, (srcChainId_, srcAddress_, nonce_, payload_))
        );
        // try-catch all errors/exceptions
        if (!success) {
            bytes32 hashedPayload = keccak256(payload_);
            failedMessages[srcChainId_][srcAddress_][nonce_] = hashedPayload;
            emit ReceivePayloadFailed(srcChainId_, srcAddress_, nonce_, reason); // Retrieve payload from the src side tx if needed to clear
        }
    }

    /**
     * @notice Process non blocking LayerZero receive request
     * @param srcChainId Source chain id
     * @param payload Encoded payload containing votes information.
     */
    function _nonblockingLzReceive(
        uint16 srcChainId,
        bytes memory,
        uint64,
        bytes memory payload
    ) internal virtual override {
        (address delegatee, uint32 checkpoints, uint96 votes) = abi.decode(payload, (address, uint32, uint96));
        multichainVoteRegistry.updateVotes(srcChainId, delegatee, checkpoints, votes);
        emit VotesSynced(delegatee, checkpoints, votes);
    }
}
