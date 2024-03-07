// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

/**
 * @title IVoteSyncBridge
 * @author Venus
 * @notice Interface implemented by `VotesSyncSender` and `VoteSyncReceiver`
 */
interface IVoteSyncBridge {
    /**
     * @notice Transfers ownership of the contract to the specified address
     * @param addr The address to which ownership of the contract will be transferred
     */
    function transferOwnership(address addr) external;

    /**
     * @notice Sets the trusted remote address for a specified remote chain Id
     * @param remoteChainId Chain Id of the remote chain
     * @param srcAddress Address of the remote bridge
     */
    function setTrustedRemoteAddress(uint16 remoteChainId, bytes calldata srcAddress) external;

    /**
     * @notice Checks if a given address is trusted on the specified remote chain Id
     * @param remoteChainId The Id of the remote chain
     * @param srcAddress The address to be checked for trust on the specified remote chain
     */
    function isTrustedRemote(uint16 remoteChainId, bytes calldata srcAddress) external returns (bool);
}
