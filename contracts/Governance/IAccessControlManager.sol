pragma solidity ^0.5.16;

interface IAccessControlManager {
   /**
     * @notice Verifies if the given account can call a praticular contract's function
     * @dev Since the contract is calling itself this function, we can get contracts address with msg.sender
     * @param account address (eoa or contract) for which call permissions will be checked
     * @param functionSig signature e.g. "functionName(uint,bool)"
     * @return false if the user account cannot call the particular contract function
     *
     */
    function isAllowedToCall(address account, string calldata functionSig) external view returns (bool);

    /**
     * @notice Gives a function call permission to one single account
     * @dev this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
     * 		May emit a {RoleGranted} event.
     * @param contractAddress address of contract for which call permissions will be granted
     * @param functionSig signature e.g. "functionName(uint,bool)"
     */
    function giveCallPermission(address contractAddress, string calldata functionSig, address accountToPermit) external;

    /**
     * @notice Revokes an account's permission to a particular function call
     * @dev this function can be called only from Role Admin or DEFAULT_ADMIN_ROLE
     * 		May emit a {RoleRevoked} event.
     * @param contractAddress address of contract for which call permissions will be revoked
     * @param functionSig signature e.g. "functionName(uint,bool)"
     */
    function revokeCallPermission(address contractAddress, string calldata functionSig, address accountToRevoke) external;
}