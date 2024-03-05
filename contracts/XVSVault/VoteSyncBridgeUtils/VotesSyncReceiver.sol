// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { NonblockingLzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/NonblockingLzApp.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { ExcessivelySafeCall } from "@layerzerolabs/solidity-examples/contracts/libraries/ExcessivelySafeCall.sol";
import { IMultichainVoteRegistry } from "./interfaces/IMultichainVoteRegistry.sol";

/**
 * @title VotesSyncReceiver
 * @author Venus
 * @notice The VotesSyncReceiver is builds upon the functionality of its parent contract, NonblockingLzApp which is part of layer zero bridge.
 * It receives voting information in the form of payload from remote(non-BNB) chains and send that information to MultichainVoteRegistry.
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
    event VotesSynced(address indexed delegatee, uint32 checkpoints, uint32 nCheckpoint, uint96 indexed votes);

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
     * @notice Process non blocking LayerZero receive request
     * @param remoteChainId Remote chain id
     * @param payload Encoded payload containing votes information of previous and current delegatee
     */
    function _nonblockingLzReceive(
        uint16 remoteChainId,
        bytes memory,
        uint64,
        bytes memory payload
    ) internal virtual override whenNotPaused {
        (
            address prevDelegatee,
            uint32 prevIndex,
            uint32 prevNumCheckpoints,
            uint96 prevVotes,
            address currDelegatee,
            uint32 currIndex,
            uint32 currNumCheckpoints,
            uint96 currVotes
        ) = abi.decode(payload, (address, uint32, uint32, uint96, address, uint32, uint32, uint96));
        if (prevDelegatee != address(0)) {
            emit VotesSynced(prevDelegatee, prevIndex, prevNumCheckpoints, prevVotes);
            multichainVoteRegistry.syncDestVotes(
                remoteChainId,
                prevDelegatee,
                prevIndex,
                prevNumCheckpoints,
                prevVotes
            );
        }
        if (currDelegatee != address(0)) {
            emit VotesSynced(currDelegatee, currIndex, currNumCheckpoints, currVotes);
            multichainVoteRegistry.syncDestVotes(
                remoteChainId,
                currDelegatee,
                currIndex,
                currNumCheckpoints,
                currVotes
            );
        }
    }

    function retryMessage(
        uint16 srcChainId,
        bytes calldata srcAddress,
        uint64 nonce,
        bytes calldata payload
    ) public payable override {
        bytes memory trustedRemote = trustedRemoteLookup[srcChainId];
        // it will still block the message pathway from (srcChainId, srcAddress). should not receive message from untrusted remote.
        require(
            srcAddress.length == trustedRemote.length &&
                trustedRemote.length > 0 &&
                keccak256(srcAddress) == keccak256(trustedRemote),
            "LzApp: invalid source sending contract"
        );
        super.retryMessage(srcChainId, srcAddress, nonce, payload);
    }
}
