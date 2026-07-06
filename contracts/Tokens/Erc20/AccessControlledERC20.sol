// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

/**
 * @title AccessControlledERC20
 * @author Venus
 * @notice A generic, non-upgradeable mintable / burnable ERC-20 whose supply is controlled by the Venus
 * AccessControlManager.
 * The token name, symbol and decimals are supplied to the constructor so the same implementation can be
 * reused for different underlying assets. Minting and burning are gated by the AccessControlManager, so only
 * the addresses that governance grants the `mint(address,uint256)` / `burn(address,uint256)` permissions to
 * (e.g. the Timelocks and the Guardians) can change the supply.
 */
contract AccessControlledERC20 is ERC20, Ownable2Step {
    /// @notice Number of decimals the token uses, set at construction.
    uint8 private immutable _decimals;

    /// @notice Address of the Access Control Manager contract that gates mint / burn.
    address public accessControlManager;

    /// @notice Emitted when the address of the access control manager is updated.
    event NewAccessControlManager(address indexed oldAccessControlManager, address indexed newAccessControlManager);

    /// @notice Thrown when the caller is not allowed to perform the requested action.
    error Unauthorized();

    /**
     * @param name_ Name of the token.
     * @param symbol_ Symbol of the token.
     * @param decimals_ Number of decimals of the token.
     * @param accessControlManager_ Address of the Venus Access Control Manager contract.
     * @custom:error ZeroAddressNotAllowed is thrown when `accessControlManager_` is the zero address.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address accessControlManager_
    ) ERC20(name_, symbol_) {
        ensureNonzeroAddress(accessControlManager_);
        accessControlManager = accessControlManager_;
        _decimals = decimals_;
    }

    /**
     * @notice Creates `amount_` tokens and assigns them to `account_`, increasing the total supply.
     * @param account_ Address to which the tokens are assigned.
     * @param amount_ Amount of tokens to be minted.
     * @custom:access Controlled by AccessControlManager.
     */
    function mint(address account_, uint256 amount_) external {
        _ensureAllowed("mint(address,uint256)");
        _mint(account_, amount_);
    }

    /**
     * @notice Destroys `amount_` tokens from `account_`, reducing the total supply.
     * @param account_ Address from which the tokens are destroyed.
     * @param amount_ Amount of tokens to be burned.
     * @custom:access Controlled by AccessControlManager.
     */
    function burn(address account_, uint256 amount_) external {
        _ensureAllowed("burn(address,uint256)");
        _burn(account_, amount_);
    }

    /**
     * @notice Sets the address of the access control manager of this contract.
     * @param newAccessControlManager_ New address for the access control manager.
     * @custom:access Only owner.
     * @custom:event Emits NewAccessControlManager.
     * @custom:error ZeroAddressNotAllowed is thrown when `newAccessControlManager_` is the zero address.
     */
    function setAccessControlManager(address newAccessControlManager_) external onlyOwner {
        ensureNonzeroAddress(newAccessControlManager_);
        emit NewAccessControlManager(accessControlManager, newAccessControlManager_);
        accessControlManager = newAccessControlManager_;
    }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Reverts with {Unauthorized} if the caller is not allowed to call `functionSig_`.
     * @param functionSig_ Function signature on which access is to be checked.
     */
    function _ensureAllowed(string memory functionSig_) internal view {
        if (!IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig_)) {
            revert Unauthorized();
        }
    }
}
