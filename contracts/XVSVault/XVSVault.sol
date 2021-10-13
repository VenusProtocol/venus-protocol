pragma solidity ^0.5.16;
import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./XVSVaultProxy.sol";
import "./XVSVaultStorage.sol";
import "./XVSVaultErrorReporter.sol";

interface IXVSStore {
    function safeRewardTransfer(address _token, address _to, uint256 _amount) external;
    function setRewardToken(address _tokenAddress, bool status) external;
}

contract XVSVault is XVSVaultStorage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice Event emitted when deposit
    event Deposit(address indexed user, address indexed rewardToken, uint256 indexed pid, uint256 amount);

    /// @notice Event emitted when execute withrawal
    event ExecutedWithdrawal(address indexed user, address indexed rewardToken, uint256 indexed pid, uint256 amount);

    /// @notice Event emitted when request withrawal
    event ReqestedWithdrawal(address indexed user, address indexed rewardToken, uint256 indexed pid, uint256 amount);

    /// @notice Event emitted when admin changed
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    /// @notice An event thats emitted when an account changes its delegate
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);

    /// @notice An event thats emitted when a delegate account's vote balance changes
    event DelegateVotesChanged(address indexed delegate, uint previousBalance, uint newBalance);

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

    function poolLength(address rewardToken) external view returns (uint256) {
        return poolInfos[rewardToken].length;
    }

    // Add a new token pool. Can only be called by the admin.
    function add(
        address _rewardToken,
        uint256 _allocPoint,
        IBEP20 _token,
        uint256 _rewardPerBlock,
        bool _withUpdate
    ) public onlyAdmin {
        require(address(xvsStore) != address(0), "Store contract addres is empty");

        if (_withUpdate) {
            massUpdatePools(_rewardToken);
        }

        PoolInfo[] storage poolInfo = poolInfos[_rewardToken];

        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            require(poolInfo[pid].token != _token, "Error pool already added");
        }

        totalAllocPoints[_rewardToken] = totalAllocPoints[_rewardToken].add(_allocPoint);

        rewardTokenAmountsPerBlock[_rewardToken] = _rewardPerBlock;

        poolInfo.push(
            PoolInfo({
                token: _token,
                allocPoint: _allocPoint,
                lastRewardBlock: block.number,
                accRewardPerShare: 0
            })
        );

        IXVSStore(xvsStore).setRewardToken(_rewardToken, true);
    }

    // Update the given pool's reward allocation point. Can only be called by the admin.
    function set(
        address _rewardToken,
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyAdmin {
        if (_withUpdate) {
            massUpdatePools(_rewardToken);
        }

        PoolInfo[] storage poolInfo = poolInfos[_rewardToken];
        totalAllocPoints[_rewardToken] = totalAllocPoints[_rewardToken].sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Update the given reward token's amount per block
    function setRewardAmountPerBlock(
        address _rewardToken,
        uint256 _rewardAmount
    ) public onlyAdmin {
        rewardTokenAmountsPerBlock[_rewardToken] = _rewardAmount;
    }

    // Update the given reward token's amount per block
    function setWithdrawalLockingPeriod(
        uint256 _newPeriod
    ) public onlyAdmin {
        require(_newPeriod > 0, "Invalid new locking period");
        lockPeriod = _newPeriod;
    }

    /**
     * @notice Deposit XVSVault for XVS allocation
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _amount The amount to deposit to vault
     */
    function deposit(address _rewardToken, uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        updatePool(_rewardToken, _pid);
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(pool.accRewardPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            IXVSStore(xvsStore).safeRewardTransfer(_rewardToken, msg.sender, pending);
        }
        pool.token.transferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e12);

        // Update Delegate Amount
        if (address(pool.token) == address(xvsAddress)) {
            _updateDelegate(address(msg.sender), uint96(user.amount));
        }

        emit Deposit(msg.sender, _rewardToken, _pid, _amount);
    }

    /**
     * @notice Execute withdrawal to XVSVault for XVS allocation
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     */
    function executeWithdrawal(address _rewardToken, uint256 _pid) public nonReentrant {
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        WithdrawalInfo storage withdrawal = withdrawalInfos[_rewardToken][_pid][msg.sender];
        uint256 curTimestamp = block.timestamp;
        uint256 _amount = withdrawal.amount;

        require(withdrawal.amount > 0, "no request to execute");
        require(lockPeriod.add(withdrawal.timestamp) < curTimestamp, "your request is locked yet");

        updatePool(_rewardToken, _pid);
        uint256 pending =
            user.amount.mul(pool.accRewardPerShare).div(1e12).sub(
                user.rewardDebt
            );
        IXVSStore(xvsStore).safeRewardTransfer(_rewardToken, msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e12);
        pool.token.transfer(address(msg.sender), _amount);

        withdrawal.amount = 0;

        emit ExecutedWithdrawal(msg.sender, _rewardToken, _pid, _amount);
    }

    /**
     * @notice Request withdrawal to XVSVault for XVS allocation
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _amount The amount to withdraw to vault
     */
    function requestWithdrawal(address _rewardToken, uint256 _pid, uint256 _amount) public nonReentrant {
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        WithdrawalInfo storage withdrawal = withdrawalInfos[_rewardToken][_pid][msg.sender];
        require(_amount > 0, "requested amount cant be zero");
        require(user.amount >= _amount, "requested amount is invalid");
        require(withdrawal.amount == 0, "request again after execute");
        
        withdrawal.amount = _amount;
        withdrawal.timestamp = block.timestamp;

        // Update Delegate Amount
        if (_rewardToken == address(xvsAddress)) {
            uint256 updatedAmount = user.amount.sub(_amount);
            _updateDelegate(address(msg.sender), uint96(updatedAmount));
        }

        emit ReqestedWithdrawal(msg.sender, _rewardToken, _pid, _amount);        
    }

    /**
     * @notice Get unlocked withdrawal amount
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _user The User Address
     */
    function getEligibleWithdrawalAmount(address _rewardToken, uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        WithdrawalInfo storage withdrawal = withdrawalInfos[_rewardToken][_pid][_user];
        uint256 curTimestamp = block.timestamp;
        if(withdrawal.amount > 0 && lockPeriod.add(withdrawal.timestamp) < curTimestamp)  {
            return withdrawal.amount;
        }
        return 0;
    }

    /**
     * @notice Get requested amount
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _user The User Address
     */
    function getRequestedAmount(address _rewardToken, uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        WithdrawalInfo storage withdrawal = withdrawalInfos[_rewardToken][_pid][_user];
        return withdrawal.amount;
    }

    /**
     * @notice Get withdrawl info
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _user The User Address
     */
    function getWithdrawalInfo(address _rewardToken, uint256 _pid, address _user)
        public
        view
        returns (uint256 amount, uint256 startTimestamp, uint256 endTimestamp)
    {
        WithdrawalInfo storage withdrawal = withdrawalInfos[_rewardToken][_pid][_user];
        amount = withdrawal.amount;
        startTimestamp = withdrawal.timestamp;
        endTimestamp = lockPeriod.add(withdrawal.timestamp);
    }

    // View function to see pending XVSs on frontend.
    function pendingReward(address _rewardToken, uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        UserInfo storage user = userInfos[_rewardToken][_pid][_user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 supply = pool.token.balanceOf(address(this));
        uint256 curBlockNumber = block.number;
        uint256 rewardTokenPerBlock = rewardTokenAmountsPerBlock[_rewardToken];
        if (curBlockNumber > pool.lastRewardBlock && supply != 0) {
            uint256 multiplier = curBlockNumber.sub(pool.lastRewardBlock);
            uint256 reward =
                multiplier.mul(rewardTokenPerBlock).mul(pool.allocPoint).div(
                    totalAllocPoints[_rewardToken]
                );
            accRewardPerShare = accRewardPerShare.add(
                reward.mul(1e12).div(supply)
            );
        }
        return user.amount.mul(accRewardPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools(address _rewardToken) public {
        uint256 length = poolInfos[_rewardToken].length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(_rewardToken, pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(address _rewardToken, uint256 _pid) public {
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 supply = pool.token.balanceOf(address(this));
        if (supply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 curBlockNumber = block.number;
        uint256 multiplier = curBlockNumber.sub(pool.lastRewardBlock);
        uint256 reward =
            multiplier.mul(rewardTokenAmountsPerBlock[_rewardToken]).mul(pool.allocPoint).div(
                totalAllocPoints[_rewardToken]
            );
        pool.accRewardPerShare = pool.accRewardPerShare.add(
            reward.mul(1e12).div(supply)
        );
        pool.lastRewardBlock = block.number;
    }

    // Get user info with reward token address and pid
    function getUserInfo(
        address _rewardToken,
        uint256 _pid,
        address _user
    )
    public view returns (uint256 amount, uint256 rewardDebt) {
        UserInfo storage user = userInfos[_rewardToken][_pid][_user];
        amount = user.amount;
        rewardDebt = user.rewardDebt;
    }

    /**
     * @notice Get the XVS stake balance of an account
     * @param account The address of the account to check
     * @return The balance that user staked
     */
    function getStakeAmount(address account) internal view returns (uint96) {
        require(xvsAddress != address(0), "XVSVault::getStakeAmount: xvs address is not set");

        PoolInfo[] storage poolInfo = poolInfos[xvsAddress];

        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            if (address(poolInfo[pid].token) == address(xvsAddress)) {
                UserInfo storage user = userInfos[xvsAddress][pid][account];
                return uint96(user.amount);
            }
        }
        return uint96(0);
    }

    /**
     * @notice Update Delegates - voting power
     * @param delegator The address of Delegator
     * @param amount Updated delegate amount
     */
    function _updateDelegate(address delegator, uint96 amount) internal {
        address currentDelegate = delegates[delegator];

        if (currentDelegate != address(0)) {
            uint32 delegateRepNum = numCheckpoints[currentDelegate];
            uint96 delegateRepOld = delegateRepNum > 0 ? checkpoints[currentDelegate][delegateRepNum - 1].votes : 0;
            _writeCheckpoint(currentDelegate, delegateRepNum, delegateRepOld, amount);
        }
    }

    /**
     * @notice Delegate votes from `msg.sender` to `delegatee`
     * @param delegatee The address to delegate votes to
     */
    function delegate(address delegatee) public {
        return _delegate(msg.sender, delegatee);
    }

    /**
     * @notice Delegates votes from signatory to `delegatee`
     * @param delegatee The address to delegate votes to
     * @param nonce The contract state required to match the signature
     * @param expiry The time at which to expire the signature
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function delegateBySig(address delegatee, uint nonce, uint expiry, uint8 v, bytes32 r, bytes32 s) public {
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("XVSVault")), getChainId(), address(this)));
        bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "XVSVault::delegateBySig: invalid signature");
        require(nonce == nonces[signatory]++, "XVSVault::delegateBySig: invalid nonce");
        require(now <= expiry, "XVSVault::delegateBySig: signature expired");
        return _delegate(signatory, delegatee);
    }

    /**
     * @notice Gets the current votes balance for `account`
     * @param account The address to get votes balance
     * @return The number of current votes for `account`
     */
    function getCurrentVotes(address account) external view returns (uint96) {
        uint32 nCheckpoints = numCheckpoints[account];
        return nCheckpoints > 0 ? checkpoints[account][nCheckpoints - 1].votes : 0;
    }

    function _delegate(address delegator, address delegatee) internal {
        address currentDelegate = delegates[delegator];
        uint96 delegatorBalance = getStakeAmount(delegator);
        delegates[delegator] = delegatee;

        emit DelegateChanged(delegator, currentDelegate, delegatee);

        _moveDelegates(currentDelegate, delegatee, delegatorBalance);
    }

    function _moveDelegates(address srcRep, address dstRep, uint96 amount) internal {
        if (srcRep != dstRep && amount > 0) {
            if (srcRep != address(0)) {
                uint32 srcRepNum = numCheckpoints[srcRep];
                uint96 srcRepOld = srcRepNum > 0 ? checkpoints[srcRep][srcRepNum - 1].votes : 0;
                uint96 srcRepNew = sub96(srcRepOld, amount, "XVSVault::_moveVotes: vote amount underflows");
                _writeCheckpoint(srcRep, srcRepNum, srcRepOld, srcRepNew);
            }

            if (dstRep != address(0)) {
                uint32 dstRepNum = numCheckpoints[dstRep];
                uint96 dstRepOld = dstRepNum > 0 ? checkpoints[dstRep][dstRepNum - 1].votes : 0;
                uint96 dstRepNew = add96(dstRepOld, amount, "XVSVault::_moveVotes: vote amount overflows");
                _writeCheckpoint(dstRep, dstRepNum, dstRepOld, dstRepNew);
            }
        }
    }

    function _writeCheckpoint(address delegatee, uint32 nCheckpoints, uint96 oldVotes, uint96 newVotes) internal {
        uint32 blockNumber = safe32(block.number, "XVSVault::_writeCheckpoint: block number exceeds 32 bits");

        if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1].fromBlock == blockNumber) {
            checkpoints[delegatee][nCheckpoints - 1].votes = newVotes;
        } else {
            checkpoints[delegatee][nCheckpoints] = Checkpoint(blockNumber, newVotes);
            numCheckpoints[delegatee] = nCheckpoints + 1;
        }

        emit DelegateVotesChanged(delegatee, oldVotes, newVotes);
    }

    function safe32(uint n, string memory errorMessage) internal pure returns (uint32) {
        require(n < 2**32, errorMessage);
        return uint32(n);
    }

    function safe96(uint n, string memory errorMessage) internal pure returns (uint96) {
        require(n < 2**96, errorMessage);
        return uint96(n);
    }

    function add96(uint96 a, uint96 b, string memory errorMessage) internal pure returns (uint96) {
        uint96 c = a + b;
        require(c >= a, errorMessage);
        return c;
    }

    function sub96(uint96 a, uint96 b, string memory errorMessage) internal pure returns (uint96) {
        require(b <= a, errorMessage);
        return a - b;
    }

    function getChainId() internal pure returns (uint) {
        uint256 chainId;
        assembly { chainId := chainid() }
        return chainId;
    }

    /**
     * @notice Determine the xvs stake balance for an account
     * @param account The address of the account to check
     * @param blockNumber The block number to get the vote balance at
     * @return The balance that user staked
     */
    function getPriorVotes(address account, uint256 blockNumber) external view returns (uint96) {
        require(blockNumber < block.number, "XVSVault::getPriorVotes: not yet determined");

        uint32 nCheckpoints = numCheckpoints[account];
        if (nCheckpoints == 0) {
            return 0;
        }

        // First check most recent balance
        if (checkpoints[account][nCheckpoints - 1].fromBlock <= blockNumber) {
            return checkpoints[account][nCheckpoints - 1].votes;
        }

        // Next check implicit zero balance
        if (checkpoints[account][0].fromBlock > blockNumber) {
            return 0;
        }

        uint32 lower = 0;
        uint32 upper = nCheckpoints - 1;
        while (upper > lower) {
            uint32 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
            Checkpoint memory cp = checkpoints[account][center];
            if (cp.fromBlock == blockNumber) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return checkpoints[account][lower].votes;
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

    function setXvsStore(address _xvs, address _xvsStore) public onlyAdmin {
        xvsAddress = _xvs;
        xvsStore = _xvsStore;

        _notEntered = true;
    }
}
