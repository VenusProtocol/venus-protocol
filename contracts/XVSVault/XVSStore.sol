pragma solidity ^0.5.16;
import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";

contract XVSStore {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice The Admin Address
    address public admin;

    /// @notice The pending admin address
    address public pendingAdmin;

    /// @notice The Owner Address
    address public owner;

    /// @notice The reward tokens
    mapping(address => bool) public rewardTokens;

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

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

    // Safe reward token transfer function, just in case if rounding error causes pool to not have enough tokens.
    function safeRewardTransfer(address token, address _to, uint256 _amount) external onlyOwner {
        require(rewardTokens[token] == true, "only reward token can");

        if (address(token) != address(0)) {
            uint256 tokenBalance = IBEP20(token).balanceOf(address(this));
            if (_amount > tokenBalance) {
                IBEP20(token).safeTransfer(_to, tokenBalance);
            } else {
                IBEP20(token).safeTransfer(_to, _amount);
            }
        }
    }

    function setPendingAdmin(address _admin) external onlyAdmin {
        address oldPendingAdmin = pendingAdmin;
        pendingAdmin = _admin;
        emit NewPendingAdmin(oldPendingAdmin, _admin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "only pending admin");
        address oldAdmin = admin;
        address oldPendingAdmin = pendingAdmin;

        admin = pendingAdmin;
        pendingAdmin = address(0);

        emit NewPendingAdmin(oldPendingAdmin, pendingAdmin);
        emit AdminTransferred(oldAdmin, admin);
    }

    function setNewOwner(address _owner) external onlyAdmin {
        require(_owner != address(0), "new owner is the zero address");
        address oldOwner = owner;
        owner = _owner;
        emit OwnerTransferred(oldOwner, _owner);
    }

    function setRewardToken(address _tokenAddress, bool status) external {
        require(msg.sender == admin || msg.sender == owner, "only admin or owner can");
        rewardTokens[_tokenAddress] = status;
    }

    function emergencyRewardWithdraw(address _tokenAddress, uint256 _amount) external onlyOwner {
        IBEP20(_tokenAddress).safeTransfer(address(msg.sender), _amount);
    }
}
