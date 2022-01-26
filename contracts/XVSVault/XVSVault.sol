pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../Utils/ECDSA.sol";
import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./XVSVaultProxy.sol";
import "./XVSVaultStorage.sol";
import "./XVSVaultErrorReporter.sol";

interface IXVSStore {
    function safeRewardTransfer(address _token, address _to, uint256 _amount) external;
    function setRewardToken(address _tokenAddress, bool status) external;
}

contract XVSVault is XVSVaultStorage, ECDSA {
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
    event DelegateChangedV2(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);

    /// @notice An event thats emitted when a delegate account's vote balance changes
    event DelegateVotesChangedV2(address indexed delegate, uint previousBalance, uint newBalance);

    /// @notice An event emitted when the reward store address is updated
    event StoreUpdated(address oldXvs, address oldStore, address newXvs, address newStore);

    /// @notice An event emitted when the withdrawal locking period is updated for a pool
    event WithdrawalLockingPeriodUpdated(
        address indexed rewardToken,
        uint indexed pid,
        uint oldPeriod,
        uint newPeriod
    );

    /// @notice An event emitted when the reward amount per block is modified for a pool
    event RewardAmountUpdated(address indexed rewardToken, uint oldReward, uint newReward);

    /// @notice An event emitted when a new pool is added
    event PoolAdded(
        address indexed rewardToken,
        uint indexed pid,
        address indexed token,
        uint allocPoints,
        uint rewardPerBlock,
        uint lockPeriod
    );

    /// @notice An event emitted when a pool allocation points are updated
    event PoolUpdated(
        address indexed rewardToken,
        uint indexed pid,
        uint oldAllocPoints,
        uint newAllocPoints
    );

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

    /**
     * @notice Add a new token pool. Can only be called by the admin.
     * @dev This vault DOES NOT support deflationary tokens — it expects that
     *   the amount of transferred tokens would equal the actually deposited
     *   amount. In practice this means that this vault DOES NOT support USDT
     *   and similar tokens (that do not provide these guarantees).
     */
    function add(
        address _rewardToken,
        uint256 _allocPoint,
        IBEP20 _token,
        uint256 _rewardPerBlock,
        uint256 _lockPeriod
    )
        external
        onlyAdmin
    {
        require(address(xvsStore) != address(0), "Store contract addres is empty");

        massUpdatePools(_rewardToken);

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
                accRewardPerShare: 0,
                lockPeriod: _lockPeriod
            })
        );

        IXVSStore(xvsStore).setRewardToken(_rewardToken, true);

        emit PoolAdded(
            _rewardToken,
            poolInfo.length - 1,
            address(_token),
            _allocPoint,
            _rewardPerBlock,
            _lockPeriod
        );
    }

    // Update the given pool's reward allocation point. Can only be called by the admin.
    function set(
        address _rewardToken,
        uint256 _pid,
        uint256 _allocPoint
    )
        external
        onlyAdmin
    {
        _ensureValidPool(_rewardToken, _pid);
        massUpdatePools(_rewardToken);

        PoolInfo[] storage poolInfo = poolInfos[_rewardToken];
        totalAllocPoints[_rewardToken] = totalAllocPoints[_rewardToken].sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        uint256 oldAllocPoints = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;

        emit PoolUpdated(_rewardToken, _pid, oldAllocPoints, _allocPoint);
    }

    // Update the given reward token's amount per block
    function setRewardAmountPerBlock(
        address _rewardToken,
        uint256 _rewardAmount
    )
        external
        onlyAdmin
    {
        massUpdatePools(_rewardToken);
        uint256 oldReward = rewardTokenAmountsPerBlock[_rewardToken];
        rewardTokenAmountsPerBlock[_rewardToken] = _rewardAmount;

        emit RewardAmountUpdated(_rewardToken, oldReward, _rewardAmount);
    }

    // Update the given reward token's amount per block
    function setWithdrawalLockingPeriod(
        address _rewardToken,
        uint256 _pid,
        uint256 _newPeriod
    )
        external
        onlyAdmin
    {
        _ensureValidPool(_rewardToken, _pid);
        require(_newPeriod > 0, "Invalid new locking period");
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        uint256 oldPeriod = pool.lockPeriod;
        pool.lockPeriod = _newPeriod;

        emit WithdrawalLockingPeriodUpdated(_rewardToken, _pid, oldPeriod, _newPeriod);
    }

    /**
     * @notice Deposit XVSVault for XVS allocation
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _amount The amount to deposit to vault
     */
    function deposit(address _rewardToken, uint256 _pid, uint256 _amount)
        external
        nonReentrant
    {
        _ensureValidPool(_rewardToken, _pid);
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        _updatePool(_rewardToken, _pid);
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(pool.accRewardPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            IXVSStore(xvsStore).safeRewardTransfer(_rewardToken, msg.sender, pending);
        }
        pool.token.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e12);

        // Update Delegate Amount
        if (address(pool.token) == address(xvsAddress)) {
            _moveDelegates(address(0), delegates[msg.sender], uint96(_amount));
        }

        emit Deposit(msg.sender, _rewardToken, _pid, _amount);
    }

    /**
     * @notice Pushes withdrawal request to the requests array and updates
     *   the pending withdrawals amount. The requests are always sorted
     *   by unlock time (descending) so that the earliest to execute requests
     *   are always at the end of the array.
     * @param _user The user struct storage pointer
     * @param _requests The user's requests array storage pointer
     * @param _amount The amount being requested
     */
    function pushWithdrawalRequest(
        UserInfo storage _user,
        WithdrawalRequest[] storage _requests,
        uint _amount,
        uint _lockedUntil
    )
        internal
    {
        uint i = _requests.length;
        _requests.push(WithdrawalRequest(0, 0));
        // Keep it sorted so that the first to get unlocked request is always at the end
        for (; i > 0 && _requests[i - 1].lockedUntil <= _lockedUntil; --i) {
            _requests[i] = _requests[i - 1];
        }
        _requests[i] = WithdrawalRequest(_amount, _lockedUntil);
        _user.pendingWithdrawals = _user.pendingWithdrawals.add(_amount);
    }

    /**
     * @notice Pops the requests with unlock time < now from the requests
     *   array and deducts the computed amount from the user's pending
     *   withdrawals counter. Assumes that the requests array is sorted
     *   by unclock time (descending).
     * @dev This function **removes** the eligible requests from the requests
     *   array. If this function is called, the withdrawal should actually
     *   happen (or the transaction should be reverted).
     * @param _user The user struct storage pointer
     * @param _requests The user's requests array storage pointer
     * @return The amount eligible for withdrawal (this amount should be
     *   sent to the user, otherwise the state would be inconsistent).
     */
    function popEligibleWithdrawalRequests(
        UserInfo storage _user,
        WithdrawalRequest[] storage _requests
    )
        internal
        returns (uint withdrawalAmount)
    {
        // Since the requests are sorted by their unlock time, we can just
        // pop them from the array and stop at the first not-yet-eligible one
        for (uint i = _requests.length; i > 0 && isUnlocked(_requests[i - 1]); --i) {
            withdrawalAmount = withdrawalAmount.add(_requests[i - 1].amount);
            _requests.pop();
        }
        _user.pendingWithdrawals = _user.pendingWithdrawals.sub(withdrawalAmount);
        return withdrawalAmount;
    }

    /**
     * @notice Checks if the request is eligible for withdrawal.
     * @param _request The request struct storage pointer
     * @return True if the request is eligible for withdrawal, false otherwise
     */
    function isUnlocked(WithdrawalRequest storage _request) private view returns (bool) {
        return _request.lockedUntil <= block.timestamp;
    }

    /**
     * @notice Execute withdrawal to XVSVault for XVS allocation
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     */
    function executeWithdrawal(address _rewardToken, uint256 _pid)
        external
        nonReentrant
    {
        _ensureValidPool(_rewardToken, _pid);
        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        WithdrawalRequest[] storage requests = withdrawalRequests[_rewardToken][_pid][msg.sender];

        uint256 _amount = popEligibleWithdrawalRequests(user, requests);
        require(_amount > 0, "nothing to withdraw");

        _updatePool(_rewardToken, _pid);
        uint256 pending =
            user.amount.mul(pool.accRewardPerShare).div(1e12).sub(
                user.rewardDebt
            );
        IXVSStore(xvsStore).safeRewardTransfer(_rewardToken, msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e12);
        pool.token.safeTransfer(address(msg.sender), _amount);

        emit ExecutedWithdrawal(msg.sender, _rewardToken, _pid, _amount);
    }

    /**
     * @notice Request withdrawal to XVSVault for XVS allocation
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _amount The amount to withdraw to vault
     */
    function requestWithdrawal(address _rewardToken, uint256 _pid, uint256 _amount)
        external
        nonReentrant
    {
        _ensureValidPool(_rewardToken, _pid);
        require(_amount > 0, "requested amount cannot be zero");
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        require(user.amount >= user.pendingWithdrawals.add(_amount), "requested amount is invalid");

        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        WithdrawalRequest[] storage requests = withdrawalRequests[_rewardToken][_pid][msg.sender];
        uint lockedUntil = pool.lockPeriod.add(block.timestamp);

        pushWithdrawalRequest(user, requests, _amount, lockedUntil);

        // Update Delegate Amount
        if (_rewardToken == address(xvsAddress)) {
            _moveDelegates(delegates[msg.sender], address(0), uint96(_amount));
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
        external
        view
        returns (uint withdrawalAmount)
    {
        _ensureValidPool(_rewardToken, _pid);
        WithdrawalRequest[] storage requests = withdrawalRequests[_rewardToken][_pid][_user];
        // Since the requests are sorted by their unlock time, we can take
        // the entries from the end of the array and stop at the first
        // not-yet-eligible one
        for (uint i = requests.length; i > 0 && isUnlocked(requests[i - 1]); --i) {
            withdrawalAmount = withdrawalAmount.add(requests[i - 1].amount);
        }
        return withdrawalAmount;
    }

    /**
     * @notice Get requested amount
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _user The User Address
     */
    function getRequestedAmount(address _rewardToken, uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        _ensureValidPool(_rewardToken, _pid);
        UserInfo storage user = userInfos[_rewardToken][_pid][_user];
        return user.pendingWithdrawals;
    }

    /**
     * @notice Returns the array of withdrawal requests that have not been executed yet
     * @param _rewardToken The Reward Token Address
     * @param _pid The Pool Index
     * @param _user The User Address
     */
    function getWithdrawalRequests(address _rewardToken, uint256 _pid, address _user)
        external
        view
        returns (WithdrawalRequest[] memory)
    {
        _ensureValidPool(_rewardToken, _pid);
        return withdrawalRequests[_rewardToken][_pid][_user];
    }

    // View function to see pending XVSs on frontend.
    function pendingReward(address _rewardToken, uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        _ensureValidPool(_rewardToken, _pid);
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
            _updatePool(_rewardToken, pid);
        }
    }

    function updatePool(address _rewardToken, uint256 _pid)
        external
    {
        _ensureValidPool(_rewardToken, _pid);
        _updatePool(_rewardToken, _pid);
    }

    // Update reward variables of the given pool to be up-to-date.
    function _updatePool(address _rewardToken, uint256 _pid)
        internal
    {
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

    function _ensureValidPool(address rewardToken, uint256 pid) internal view {
        require(pid < poolInfos[rewardToken].length , "vault: pool exists?");
    }

    // Get user info with reward token address and pid
    function getUserInfo(
        address _rewardToken,
        uint256 _pid,
        address _user
    )
        external
        view
        returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals)
    {
        _ensureValidPool(_rewardToken, _pid);
        UserInfo storage user = userInfos[_rewardToken][_pid][_user];
        amount = user.amount;
        rewardDebt = user.rewardDebt;
        pendingWithdrawals = user.pendingWithdrawals;
    }

    /**
     * @notice Get the XVS stake balance of an account (excluding the pending withdrawals)
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
                return uint96(user.amount.sub(user.pendingWithdrawals));
            }
        }
        return uint96(0);
    }

    /**
     * @notice Delegate votes from `msg.sender` to `delegatee`
     * @param delegatee The address to delegate votes to
     */
    function delegate(address delegatee) external {
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
    function delegateBySig(address delegatee, uint nonce, uint expiry, uint8 v, bytes32 r, bytes32 s)
        external
    {
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("XVSVault")), getChainId(), address(this)));
        bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ECDSA.recover(digest, v, r, s);
        require(nonce == nonces[signatory]++, "XVSVault::delegateBySig: invalid nonce");
        require(block.timestamp <= expiry, "XVSVault::delegateBySig: signature expired");
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

        emit DelegateChangedV2(delegator, currentDelegate, delegatee);

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

        emit DelegateVotesChangedV2(delegatee, oldVotes, newVotes);
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
    function getAdmin() external view returns (address) {
        return admin;
    }

    /**
     * @dev Burn the current admin
     */
    function burnAdmin() external onlyAdmin {
        emit AdminTransferred(admin, address(0));
        admin = address(0);
    }

    /*** Admin Functions ***/

    function _become(XVSVaultProxy xvsVaultProxy) external {
        require(msg.sender == xvsVaultProxy.admin(), "only proxy admin can change brains");
        require(xvsVaultProxy._acceptImplementation() == 0, "change not authorized");
    }

    function setXvsStore(address _xvs, address _xvsStore) external onlyAdmin {
        address oldXvsContract = xvsAddress;
        address oldStore = xvsStore;
        xvsAddress = _xvs;
        xvsStore = _xvsStore;

        _notEntered = true;

        emit StoreUpdated(oldXvsContract, oldStore, _xvs, _xvsStore);
    }
}
