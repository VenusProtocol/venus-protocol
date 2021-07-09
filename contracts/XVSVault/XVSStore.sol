pragma solidity ^0.5.16;
import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";

contract XVSStore {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice The XVS Token Address
    IBEP20 public xvs;

    /// @notice The Admin Address
    address public admin;

    /// @notice The Owner Address
    address public owner;

    /// @notice Event emitted when admin changed
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    /// @notice Event emitted when owner changed
    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner can");
        _;
    }

    // Safe xvs transfer function, just in case if rounding error causes pool to not have enough XVSs.
    function safeXVSTransfer(address _to, uint256 _amount) public onlyOwner {
        if (address(xvs) != address(0)) {
            uint256 xvsBal = xvs.balanceOf(address(this));
            if (_amount > xvsBal) {
                xvs.transfer(_to, xvsBal);
            } else {
                xvs.transfer(_to, _amount);
            }
        }
    }

    function setNewAdmin(address _admin) public onlyAdmin {
        require(_admin != address(0), "new admin is the zero address");
        emit AdminTransferred(admin, _admin);
        admin = _admin;
    }

    function setNewOwner(address _owner) public onlyAdmin {
        require(_owner != address(0), "new owner is the zero address");
        emit OwnerTransferred(owner, _owner);
        owner = _owner;
    }

    function setVenusInfo(address _xvs) public onlyAdmin {
        xvs = IBEP20(_xvs);
    }
}
