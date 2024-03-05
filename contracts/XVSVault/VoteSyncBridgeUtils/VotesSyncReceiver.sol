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
    event VotesSynced(address indexed delegatee, uint32 checkpoints, uint96 indexed votes, uint32 nCheckpoint);

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
     * @param payload Encoded payload containing votes information: abi.encode(delegatee, ncheckpoints, votes)
     */
    function _nonblockingLzReceive(
        uint16 remoteChainId,
        bytes memory,
        uint64,
        bytes memory payload
    ) internal virtual override whenNotPaused {
        (address delegatee, uint32 index, uint32 numCheckpoints, uint96 votes) = abi.decode(
            payload,
            (address, uint32, uint32, uint96)
        );
        emit VotesSynced(delegatee, index, votes, numCheckpoints);
        multichainVoteRegistry.syncDestVotes(remoteChainId, delegatee, index, numCheckpoints, votes);
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
