// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { IVoteSyncBridge } from "./interfaces/IVotesSyncBridge.sol";

/**
 * @title VotesSyncReceiverAdmin
 * @author Venus
 * @notice The VotesSyncReceiverAdmin contract extends a parent contract AccessControlledV8 for access control, and it manages contract called voteSyncBridge.
 * It maintains a registry of function signatures and names, allowing for dynamic function handling i.e checking of access control of interaction with only owner functions.
 */
contract VotesSyncBridgeAdmin is AccessControlledV8 {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVoteSyncBridge public immutable voteSyncBridge;
    /**
     * @notice A mapping keeps track of function signature associated with function name string.
     */
    mapping(bytes4 => string) public functionRegistry;

    /**
     * @notice Event emitted when function registry updated
     */
    event FunctionRegistryChanged(string signature, bool active);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address voteSyncBridge_) {
        ensureNonzeroAddress(voteSyncBridge_);
        voteSyncBridge = IVoteSyncBridge(voteSyncBridge_);
        _disableInitializers();
    }

    /**
     * @param accessControlManager_ Address of access control manager contract
     * @custom:error ZeroAddressNotAllowed is thrown when accessControlManager contract address is zero
     */
    function initialize(address accessControlManager_) external initializer {
        ensureNonzeroAddress(accessControlManager_);
        __AccessControlled_init(accessControlManager_);
    }

    /**
     * @notice Sets the trusted remote address for a specified remote chain ID
     * @param remoteChainId Chain Id of the remote chain
     * @param remoteAddress Address of the remote bridge
     * @custom:error ZeroAddressNotAllowed is thrown when remoteAddress contract address is zero
     * @custom:access Controlled by Access Control Manager
     */
    function setTrustedRemoteAddress(uint16 remoteChainId, bytes calldata remoteAddress) external {
        _checkAccessAllowed("setTrustedRemoteAddress(uint16,bytes)");
        require(remoteChainId != 0, "ChainId must not be zero");
        ensureNonzeroAddress(bytesToAddress(remoteAddress));
        voteSyncBridge.setTrustedRemoteAddress(remoteChainId, remoteAddress);
    }

    /**
     * @notice Returns bool = true if srcAddress is trustedRemote corresponds to chainId_.
     * @param remoteChainId Chain Id of the remote chain.
     * @param remoteAddress Address of the remote bridge.
     * @custom:error ZeroAddressNotAllowed is thrown when remoteAddress contract address is zero.
     */
    function isTrustedRemote(uint16 remoteChainId, bytes calldata remoteAddress) external returns (bool) {
        require(remoteChainId != 0, "ChainId must not be zero");
        ensureNonzeroAddress(bytesToAddress(remoteAddress));
        return voteSyncBridge.isTrustedRemote(remoteChainId, remoteAddress);
    }

    /**
     * @notice Invoked when called function does not exist in the contract
     * @param data Calldata containing the encoded function call
     * @return Result of function call
     * @custom:access Controlled by AccessControlManager
     */
    fallback(bytes calldata data) external returns (bytes memory) {
        string memory fun = _getFunctionName(msg.sig);
        require(bytes(fun).length != 0, "Function not found");
        _checkAccessAllowed(fun);
        (bool ok, bytes memory res) = address(voteSyncBridge).call(data);
        require(ok, "call failed");
        return res;
    }

    /**
     * @notice A registry of functions that are allowed to be executed from proposals
     * @param signatures  Function signature to be added or removed
     * @param active Bool value, should be true to add function
     * @custom:event Emit FunctionRegistryChanged with signatures and its active bool value
     * @custom:access Only owner
     */
    function upsertSignature(string[] calldata signatures, bool[] calldata active) external onlyOwner {
        uint256 signatureLength = signatures.length;
        require(signatureLength == active.length, "Input arrays must have the same length");
        for (uint256 i; i < signatureLength; i++) {
            bytes4 sigHash = bytes4(keccak256(bytes(signatures[i])));
            bytes memory signature = bytes(functionRegistry[sigHash]);
            if (active[i] && signature.length == 0) {
                functionRegistry[sigHash] = signatures[i];
                emit FunctionRegistryChanged(signatures[i], true);
            } else if (!active[i] && signature.length != 0) {
                delete functionRegistry[sigHash];
                emit FunctionRegistryChanged(signatures[i], false);
            }
        }
    }

    /**
     * @notice This function transfer the ownership of the bridge from this contract to new owner
     * @param newOwner New owner of the XVS Bridge
     * @custom:access Controlled by AccessControlManager
     */
    function transferBridgeOwnership(address newOwner) external {
        _checkAccessAllowed("transferBridgeOwnership(address)");
        ensureNonzeroAddress(newOwner);
        voteSyncBridge.transferOwnership(newOwner);
    }

    /**
     * @notice Empty implementation of renounce ownership to avoid any mishappening
     */
    function renounceOwnership() public override {}

    /**
     * @dev Returns function name string associated with function signature
     * @param signature Function signature
     */
    function _getFunctionName(bytes4 signature) internal view returns (string memory) {
        return functionRegistry[signature];
    }

    /**
     * @dev Converts bytes into address
     * @param data Data in bytes to be converted into address
     */
    function bytesToAddress(bytes calldata data) private pure returns (address) {
        return address(uint160(bytes20(data)));
    }
}
