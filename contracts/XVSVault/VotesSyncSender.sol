// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ILayerZeroEndpoint } from "@layerzerolabs/solidity-examples/contracts/lzApp/interfaces/ILayerZeroEndpoint.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

contract VotesSyncSender is Ownable, Pausable, ReentrancyGuard {
    /**
     * @notice Remote chain id of binance
     */
    uint16 public constant BSC_CHAIN_ID = 10102;

    /**
     * @notice Number of times votes synced
     */
    uint256 public votesSync;
    /**
     * @notice LayerZero endpoint for sending messages to remote chains
     */
    ILayerZeroEndpoint public LZ_ENDPOINT;

    /**
     * @notice Acess Control Manager
     */
    IAccessControlManagerV8 public accessControlManager;
    /**
     * @notice Execution hashes of failed messages
     * @dev [proposalId] -> [executionHash]
     */
    mapping(uint256 => bytes32) public storedExecutionHashes;
    /**
     * @notice Specifies the allowed path for sending messages (remote chainId => remote app address + local app address)
     */
    mapping(uint16 => bytes) public trustedRemoteLookup;

    /**
     * @notice Emitted when a remote message receiver is set for the remote chain
     */
    event SetTrustedRemoteAddress(uint16 indexed remoteChainId, bytes remoteAddress);

    /**
     * @notice Emitted when trusted remote sets to empty.
     */
    event TrustedRemoteRemoved(uint16 indexed chainId);

    /**
     * @notice Emitted when votes synced on BSC chain successfully
     */
    event ExecuteSyncVotes(uint16 remoteChainId, bytes payload, bytes adapterParams);

    /**
     * @notice Emitted when votes synced on retry
     */
    event ClearPayload(uint256, bytes32);

    /**
     * @notice Emitted when an execution hash of a failed message is saved
     */
    event StorePayload(
        uint256 votesSync,
        uint16 remoteChainId,
        bytes payload,
        bytes adapterParams,
        uint256 value,
        bytes reason
    );

    constructor(ILayerZeroEndpoint _lzEndpoint, IAccessControlManagerV8 _accessControlManager) {
        ensureNonzeroAddress(address(_lzEndpoint));
        ensureNonzeroAddress(address(_accessControlManager));
        accessControlManager = _accessControlManager;
        LZ_ENDPOINT = _lzEndpoint;
    }

    /**
     * @notice Estimates LayerZero fees for cross-chain message delivery to the remote chain
     * @dev The estimated fees are the minimum required; it's recommended to increase the fees amount when sending a message. The unused amount will be refunded
     * @param payload The payload to be sent to the remote chain. It's computed as follows: payload = abi.encode(delegatee, checkpoints, votes)
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the destination
     * @return nativeFee The amount of fee in the native gas token (e.g. ETH)
     * @return zroFee The amount of fee in ZRO token
     */
    function estimateFee(
        bool useZro,
        bytes calldata payload,
        bytes calldata adapterParams
    ) public view returns (uint256, uint256) {
        return LZ_ENDPOINT.estimateFees(BSC_CHAIN_ID, address(this), payload, useZro, adapterParams);
    }

    /**
     * @notice Sets the remote message receiver address
     * @param remoteAddress The address of the contract on the remote chain to receive messages sent by this contract
     * @custom:access Controlled by AccessControlManager.
     * @custom:event Emits SetTrustedRemoteAddress with remote chain Id and remote address
     */
    function setTrustedRemoteAddress(bytes calldata remoteAddress) external onlyOwner {
        require((address(uint160(bytes20(remoteAddress)))) != address(0), "Remote cannot be zero address");
        trustedRemoteLookup[BSC_CHAIN_ID] = abi.encodePacked(remoteAddress, address(this));
        emit SetTrustedRemoteAddress(BSC_CHAIN_ID, remoteAddress);
    }

    /**
     * @notice Remove trusted remote from storage.
     * @custom:access Only owner.
     * @custom:event Emit TrustedRemoteRemoved with remote chain id.
     */
    function removeTrustedRemote() external onlyOwner {
        delete trustedRemoteLookup[BSC_CHAIN_ID];
        emit TrustedRemoteRemoved(BSC_CHAIN_ID);
    }

    /**
     * @notice Resends a previously failed message
     * @dev Allows providing more fees if needed. The extra fees will be refunded to the caller
     * @param votesSynced Number of votes synced to identify a failed message
     * @param payload The payload to be sent to the remote chain. It's computed as follows: payload = abi.encode(delegatee, checkpoints, votes)
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the destination
     * @param originalValue The msg.value passed when syncVotes function was called
     * @custom:event Emits ClearPayload with votesSynced and hash
     * @custom:access Controlled by Access Control Manager
     */
    function retrySyncVotes(
        uint256 votesSynced,
        bytes calldata payload,
        bytes calldata adapterParams,
        uint256 originalValue
    ) external payable nonReentrant whenNotPaused {
        _ensureAllowed("retrySyncVotes(uint256,bytes,bytes,uint256)");
        bytes32 hash = storedExecutionHashes[votesSynced];
        require(hash != bytes32(0), "VotesSyncSender: no stored payload");
        require(payload.length != 0, "VotesSyncSender: Empty payload");
        bytes memory trustedRemote = trustedRemoteLookup[BSC_CHAIN_ID];
        require(trustedRemote.length != 0, "VotesSyncSender: destination chain is not a trusted source");
        bytes memory execution = abi.encode(votesSynced, payload, adapterParams, originalValue);
        require(keccak256(execution) == hash, "VotesSyncSender: invalid execution params");

        delete storedExecutionHashes[votesSynced];

        LZ_ENDPOINT.send{ value: originalValue + msg.value }(
            BSC_CHAIN_ID,
            trustedRemoteLookup[BSC_CHAIN_ID],
            payload,
            payable(msg.sender),
            address(0),
            adapterParams
        );
        emit ClearPayload(votesSynced, hash);
    }

    /**
     * @notice Sync votes of user on BSC chain
     * @param payload  The payload to be sent to the remote chain. It's computed as follows: payload = abi.encode(delegatee, checkpoints, votes)
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the destination
     * @custom:event Emit ExecuteSyncVotes on success and StorePayload on failure
     * @custom:access Controlled by Access Control Manager
     */
    function syncVotes(bytes memory payload, bytes memory adapterParams) public payable whenNotPaused {
        _ensureAllowed("syncVotes(bytes,bytes)");
        require(payload.length != 0, "VotesSyncSender: Empty payload");
        bytes memory trustedRemote = trustedRemoteLookup[BSC_CHAIN_ID];
        require(trustedRemote.length != 0, "VotesSyncSender: destination chain is not a trusted source");
        votesSync++; // Number of times syncVotes is called
        try
            LZ_ENDPOINT.send{ value: msg.value }(
                BSC_CHAIN_ID,
                trustedRemote,
                payload,
                payable(tx.origin),
                address(0),
                adapterParams
            )
        {
            emit ExecuteSyncVotes(BSC_CHAIN_ID, payload, adapterParams);
        } catch (bytes memory reason) {
            storedExecutionHashes[votesSync] = keccak256(abi.encode(votesSync, payload, adapterParams, msg.value));
            emit StorePayload(votesSync, BSC_CHAIN_ID, payload, adapterParams, msg.value, reason);
        }
    }

    /**
     * @notice Ensure that the caller has permission to execute a specific function.
     * @param functionSig Function signature to be checked for permission.
     */
    function _ensureAllowed(string memory functionSig) internal view {
        require(
            IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig),
            "access denied"
        );
    }
}
