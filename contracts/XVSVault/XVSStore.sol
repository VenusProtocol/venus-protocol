pragma solidity 0.5.16;
import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";

/**
 * @title XVS Store
 * @author Venus
 * @notice XVS Store responsible for distributing XVS rewards
 */
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

    /**
     * @notice Safely transfer rewards. Only active reward tokens can be sent using this function.
     * Only callable by owner
     * @dev Safe reward token transfer function, just in case if rounding error causes pool to not have enough tokens.
     * @param token Reward token to transfer
     * @param _to Destination address of the reward
     * @param _amount Amount to transfer
     */
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

    /**
     * @notice Allows the admin to propose a new admin
     * Only callable admin
     * @param _admin Propose an account as admin of the XVS store
     */
    function setPendingAdmin(address _admin) external onlyAdmin {
        address oldPendingAdmin = pendingAdmin;
        pendingAdmin = _admin;
        emit NewPendingAdmin(oldPendingAdmin, _admin);
    }

    /**
     * @notice Allows an account that is pending as admin to accept the role
     * nly calllable by the pending admin
     */
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "only pending admin");
        address oldAdmin = admin;
        address oldPendingAdmin = pendingAdmin;

        admin = pendingAdmin;
        pendingAdmin = address(0);

        emit NewPendingAdmin(oldPendingAdmin, pendingAdmin);
        emit AdminTransferred(oldAdmin, admin);
    }

    /**
     * @notice Set the contract owner
     * @param _owner The address of the owner to set
     * Only callable admin
     */
    function setNewOwner(address _owner) external onlyAdmin {
        require(_owner != address(0), "new owner is the zero address");
        address oldOwner = owner;
        owner = _owner;
        emit OwnerTransferred(oldOwner, _owner);
    }

    /**
     * @notice Set or disable a reward token
     * @param _tokenAddress The address of a token to set as active or inactive
     * @param status Set whether a reward token is active or not
     */
    function setRewardToken(address _tokenAddress, bool status) external {
        require(msg.sender == admin || msg.sender == owner, "only admin or owner can");
        rewardTokens[_tokenAddress] = status;
    }

    /**
     * @notice Security function to allow the owner of the contract to withdraw from the contract
     * @param _tokenAddress Reward token address to withdraw
     * @param _amount Amount of token to withdraw
     */
    function emergencyRewardWithdraw(address _tokenAddress, uint256 _amount) external onlyOwner {
        IBEP20(_tokenAddress).safeTransfer(address(msg.sender), _amount);
    }
}
