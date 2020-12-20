pragma solidity ^0.5.16;
import "../SafeMath.sol";
import "../BEP20Interface.sol";

contract VAIVault {
    using SafeMath for uint256;
    //using SafeERC20 for IERC20;

    /// @notice Administrator for this contract
    address public admin;

    /// @notice The XVS TOKEN!
    BEP20Interface public xvs;

    /// @notice The VAI TOKEN!
    BEP20Interface public vai;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice Event emitted when VAI deposit
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when VAI withrawal
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Event emitted when admin changed
    event AdminTransfered(address indexed oldAdmin, address indexed newAdmin);

    /// @notice XVS balance of vault
    uint256 private xvsBalance;

    /// @notice Accumulated XVS per share
    uint256 public accXVSPerShare;

    //// pending rewards awaiting anyone to update
    uint256 public pendingRewards;

    /// @notice Info of each user.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    // Info of each user that stakes tokens.
    mapping(address => UserInfo) public userInfo;

    constructor(
        address _xvs,
        address _vai
    ) public {
        admin = msg.sender;
        xvs = BEP20Interface(_xvs);
        vai = BEP20Interface(_vai);

        _notEntered = true;
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
     * @notice Deposit VAI to VAIVault for XVS allocation
     * @param _amount The amount to deposit to vault
     */
    function deposit(uint256 _amount) public nonReentrant {
        UserInfo storage user = userInfo[msg.sender];

        updateVault();

        // Transfer pending tokens to user
        updateAndPayOutPending(msg.sender);

        // Transfer in the amounts from user
        if(_amount > 0) {
            vai.transferFrom(address(msg.sender), address(this), _amount); //need update
            user.amount = user.amount.add(_amount);
        }

        user.rewardDebt = user.amount.mul(accXVSPerShare).div(1e18);
        emit Deposit(msg.sender, _amount);
    }

    /**
     * @notice Withdraw VAI from VAIVault
     * @param _amount The amount to withdraw from vault
     */
    function withdraw(uint256 _amount) public nonReentrant {
        _withdraw(msg.sender, _amount);

    }

    /**
     * @notice Low level withdraw function
     * @param account The account to withdraw from vault
     * @param _amount The amount to withdraw from vault
     */
    function _withdraw(address account, uint256 _amount) internal {
        UserInfo storage user = userInfo[account];
        require(user.amount >= _amount, "withdraw: not good");

        updateVault();
        updateAndPayOutPending(account); // Update balances of account this is not withdrawal but claiming XVS farmed

        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            vai.transfer(address(account), _amount);  //need update
        }
        user.rewardDebt = user.amount.mul(accXVSPerShare).div(1e18);

        emit Withdraw(account, _amount);
    }

    /**
     * @notice View function to see pending XVS on frontend
     * @param _user The user to see pending XVS
     */
    function pendingXVS(address _user) public view returns (uint256)
    {
        UserInfo storage user = userInfo[_user];

        return user.amount.mul(accXVSPerShare).div(1e18).sub(user.rewardDebt);
    }

    /**
     * @notice Update and pay out pending XVS to user
     * @param account The user to pay out
     */
    function updateAndPayOutPending(address account) internal {
        uint256 pending = pendingXVS(account);

        if(pending > 0) {
            safeXVSTransfer(account, pending);
        }
    }

    /**
     * @notice Safe XVS transfer function, just in case if rounding error causes pool to not have enough XVS
     * @param _to The address that XVS to be transfered
     * @param _amount The amount that XVS to be transfered
     */
    function safeXVSTransfer(address _to, uint256 _amount) internal {
        uint256 xvsBal = xvs.balanceOf(address(this));

        if (_amount > xvsBal) {
            xvs.transfer(_to, xvsBal);
            xvsBalance = xvs.balanceOf(address(this));
        } else {
            xvs.transfer(_to, _amount);
            xvsBalance = xvs.balanceOf(address(this));
        }
    }

    /**
     * @notice Function that updates pending rewards
     */
    function updatePendingRewards() public {
        uint256 newRewards = xvs.balanceOf(address(this)).sub(xvsBalance);

        if(newRewards > 0) {
            xvsBalance = xvs.balanceOf(address(this)); // If there is no change the balance didn't change
            pendingRewards = pendingRewards.add(newRewards);
        }
    }

    /**
     * @notice Update reward variables to be up-to-date
     */
    function updateVault() internal {
        uint256 vaiBalance = vai.balanceOf(address(this));
        if (vaiBalance == 0) { // avoids division by 0 errors
            return;
        }

        accXVSPerShare = accXVSPerShare.add(pendingRewards.mul(1e18).div(vaiBalance));
        pendingRewards = 0;
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
}
