// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ILayerZeroEndpoint } from "@layerzerolabs/solidity-examples/contracts/lzApp/interfaces/ILayerZeroEndpoint.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { LzApp } from "@layerzerolabs/solidity-examples/contracts/lzApp/LzApp.sol";

/**
 * @title VotesSyncSender
 * @author Venus
 * @notice The VotesSyncSender send voting information of user from remote chains(non-BNB chains) to Binance chain with the help of layer zero bridge.
 * It sends voting information of user from XVSVaultDest to receiver contract on Binance chain in the form of encoded data known as payload.
 */
contract VotesSyncSender is LzApp, Pausable, ReentrancyGuard {
    /**
     * @notice Remote chain id of binance
     */
    uint16 public immutable BNB_CHAIN_ID;

    /**
     * @notice Acess Control Manager
     */
    IAccessControlManagerV8 public accessControlManager;

    /**
     * @notice Emitted when trusted remote sets to empty.
     */
    event TrustedRemoteRemoved(uint16 indexed chainId);

    /**
     * @notice Emitted when votes synced with BNB chain successfully
     */
    event ExecuteSyncVotes(uint16 indexed remoteChainId, bytes payload, bytes adapterParams);

    constructor(
        address lzEndpoint_,
        IAccessControlManagerV8 accessControlManager_,
        uint16 dstChainId_
    ) LzApp(lzEndpoint_) {
        ensureNonzeroAddress(address(lzEndpoint_));
        ensureNonzeroAddress(address(accessControlManager_));
        accessControlManager = accessControlManager_;
        BNB_CHAIN_ID = dstChainId_;
    }

    /**
     * @notice Remove trusted remote from storage.
     * @param remoteChainId_ The chain's id corresponds to setting the trusted remote to empty.
     * @custom:access Only owner.
     * @custom:event Emits TrustedRemoteRemoved once chain id is removed from trusted remote.
     */
    function removeTrustedRemote(uint16 remoteChainId_) external onlyOwner {
        delete trustedRemoteLookup[remoteChainId_];
        emit TrustedRemoteRemoved(remoteChainId_);
    }

    /**
     * @notice Sync votes of user on Binance chain
     * @param payload  The payload to be sent to the remote chain. It's computed as follows: payload = abi.encode(delegatee, checkpoint, votes)
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the destination
     * @param zroPaymentAddress Address of Layer Zero token address for fees
     * @custom:access Controlled by Access Control Manager
     */
    function syncVotes(
        bytes memory payload,
        address zroPaymentAddress,
        bytes memory adapterParams
    ) external payable whenNotPaused {
        _ensureAllowed("syncVotes(bytes,bytes)");
        require(payload.length != 0, "VotesSyncSender: Empty payload");
        _lzSend(BNB_CHAIN_ID, payload, payable(tx.origin), zroPaymentAddress, adapterParams, msg.value);
        emit ExecuteSyncVotes(BNB_CHAIN_ID, payload, adapterParams);
    }

    /**
     * @notice Estimates LayerZero fees for cross-chain message delivery to the remote chain
     * @dev The estimated fees are the minimum required; it's recommended to increase the fees amount when sending a message. The unused amount will be refunded
     * @param payload The payload to be sent to the remote chain. Containing information of previous and current delegatee
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the destination
     * @param useZro Indicates to use zro to pay layer zero fees
     * @return nativeFee The amount of fee in the native gas token (e.g. ETH)
     * @return zroFee The amount of fee in ZRO token
     */
    function estimateFee(
        bytes calldata payload,
        bytes calldata adapterParams,
        bool useZro
    ) public view returns (uint256, uint256) {
        return lzEndpoint.estimateFees(BNB_CHAIN_ID, address(this), payload, useZro, adapterParams);
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

    /**
     * @dev Empty implementation, not in use this contract is designed to serve only send the messages cross chain and does not receive.
     */
    function _blockingLzReceive(
        uint16 _srcChainId,
        bytes memory _srcAddress,
        uint64 _nonce,
        bytes memory _payload
    ) internal virtual override {}
}
