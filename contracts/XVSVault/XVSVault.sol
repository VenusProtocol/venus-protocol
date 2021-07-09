pragma solidity ^0.5.16;
import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./XVSVaultProxy.sol";
import "./XVSVaultStorage.sol";
import "./XVSVaultErrorReporter.sol";

interface IXVSStore {
    function safeXVSTransfer(address _to, uint256 _amount) external;
}

contract XVSVault is XVSVaultStorage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice Event emitted when XVS deposit
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);

    /// @notice Event emitted when XVS withrawal
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);

    /// @notice Event emitted when admin changed
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new token pool. Can only be called by the admin.
    function add(
        uint256 _allocPoint,
        IBEP20 _token,
        bool _withUpdate
    ) public onlyAdmin {
        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            require(poolInfo[pid].token != _token, "Error pool already added");
        }

        totalAllocPoint = totalAllocPoint.add(_allocPoint);

        poolInfo.push(
            PoolInfo({
                token: _token,
                allocPoint: _allocPoint,
                accXVSPerShare: 0
            })
        );
    }

    // Update the given pool's XVSs allocation point. Can only be called by the admin.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyAdmin {
        if (_withUpdate) {
            massUpdatePools();
        }

        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    /**
     * @notice Deposit XVS to XVSVault for XVS allocation
     * @param _pid The Pool Index
     * @param _amount The amount to deposit to vault
     */
    function deposit(uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        massUpdatePools();
        updateAndPayOutPending(_pid, msg.sender);

        //Transfer in the amounts from user, save gas
        if(_amount > 0) {
            pool.token.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accXVSPerShare).div(1e18);
        emit Deposit(msg.sender, _pid, _amount);
    }

    /**
     * @notice Withdraw XVS to XVSVault for XVS allocation
     * @param _pid The Pool Index
     * @param _amount The amount to withdraw to vault
     */
    function withdraw(uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        massUpdatePools();
        updateAndPayOutPending(_pid, msg.sender); // Update balances of user this is not withdrawal but claiming XVS

        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.token.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accXVSPerShare).div(1e18);

        emit Withdraw(msg.sender, _pid, _amount);
    }

    // View function to see pending XVSs on frontend.
    function pendingXVS(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accXVSPerShare = pool.accXVSPerShare;

        return user.amount.mul(accXVSPerShare).div(1e18).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 newRewards = 0;
        uint256 curXvsBalance = xvs.balanceOf(address(xvsStore));
        if (curXvsBalance > xvsBalance) {
            newRewards = curXvsBalance.sub(xvsBalance);
        }
        if(newRewards > 0) {
            xvsBalance = xvs.balanceOf(address(xvsStore));
            pendingRewards = pendingRewards.add(newRewards);
        }

        uint256 length = poolInfo.length;
        uint allRewards;
        for (uint256 pid = 0; pid < length; ++pid) {
            allRewards = allRewards.add(updatePool(pid));
        }

        pendingRewards = pendingRewards.sub(allRewards);
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) internal returns (uint256 xvsRewardWhole) {
        PoolInfo storage pool = poolInfo[_pid];

        uint256 tokenSupply = pool.token.balanceOf(address(this));
        if (tokenSupply == 0 || totalAllocPoint == 0) { // avoids division by 0 errors
            return 0;
        }
        xvsRewardWhole = pendingRewards // Multiplies pending rewards by allocation point of this pool and then total allocation
            .mul(pool.allocPoint)        // getting the percent of total pending rewards this pool should get
            .div(totalAllocPoint);       // we can do this because pools are only mass updated

        pool.accXVSPerShare = pool.accXVSPerShare.add(
            xvsRewardWhole.mul(1e18).div(tokenSupply)
        );
    }

    /**
     * @notice Update and pay out pending XVS to user
     * @param _pid The pool id
     * @param _account The user to pay out
     */
    function updateAndPayOutPending(uint256 _pid, address _account) internal {
        uint256 pending = pendingXVS(_pid, _account);

        if(pending > 0) {
            IXVSStore(xvsStore).safeXVSTransfer(_account, pending);
            xvsBalance = xvs.balanceOf(address(xvsStore));
        }
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
        emit AdminTransferred(admin, address(0));
        admin = address(0);
    }

    /**
     * @dev Set the current admin to new address
     */
    function setNewAdmin(address newAdmin) public onlyAdmin {
        require(newAdmin != address(0), "new owner is the zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /*** Admin Functions ***/

    function _become(XVSVaultProxy xvsVaultProxy) public {
        require(msg.sender == xvsVaultProxy.admin(), "only proxy admin can change brains");
        require(xvsVaultProxy._acceptImplementation() == 0, "change not authorized");
    }

    function setVenusInfo(address _xvs) public onlyAdmin {
        xvs = IBEP20(_xvs);
        _notEntered = true;
    }

    function setVenusStore(address _xvsStore) public onlyAdmin {
        xvsStore = _xvsStore;
    }
}
