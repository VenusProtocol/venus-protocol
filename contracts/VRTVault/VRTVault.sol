pragma solidity ^0.5.16;

import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./VRTVaultProxy.sol";
import "./VRTVaultStorage.sol";
import "./VRTVaultErrorReporter.sol";

contract VRTVault is VRTVaultStorage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice Event emitted when admin changed
    event AdminTransfered(address indexed oldAdmin, address indexed newAdmin);

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /*** Reentrancy Guard ***/

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }

    /**
     * @dev Returns the address of the current admin
     */
    function getAdmin() public view returns (address) {
        return admin;
    }

    /**
     * @dev Burn the current admin
     */
    function burnAdmin() public onlyAdmin {
        emit AdminTransfered(admin, address(0));
        admin = address(0);
    }

    /**
     * @dev Set the current admin to new address
     */
    function setNewAdmin(address newAdmin) public onlyAdmin {
        require(newAdmin != address(0), "new owner is the zero address");
        emit AdminTransfered(admin, newAdmin);
        admin = newAdmin;
    }

    /*** Admin Functions ***/

    function _become(VRTVaultProxy vrtVaultProxy) public {
        require(msg.sender == vrtVaultProxy.admin(), "only proxy admin can change brains");
        require(vrtVaultProxy._acceptImplementation() == 0, "change not authorized");
    }

    function setVenusInfo(address _vrt) public onlyAdmin {
        vrt = IBEP20(_vrt);

        _notEntered = true;
    }
}
