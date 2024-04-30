// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";
import { TokenVaultStorage } from "./TokenVaultStorage.sol";

/**
 * @title Token Vault
 * @author Venus
 * @notice Token vault is a generic vault that can support multiple token. User can lock their supported token in the TokenVault to receive voting rights in Venus governance.
 */
contract TokenVault is Pausable, ReentrancyGuard, Initializable, TimeManagerV8, TokenVaultStorage {
    /// @notice Event emitted when deposit
    event Deposit(address indexed user, address indexed token, uint256 indexed amount);

    /// @notice Event emitted when execute withrawal
    event ExecutedWithdrawal(address indexed user, address indexed token, uint256 indexed amount);

    /// @notice Event emitted when request withrawal
    event RequestedWithdrawal(address indexed user, address indexed token, uint256 indexed amount);

    /// @notice An event thats emitted when an account changes its delegate
    event DelegateChangedV2(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);

    /// @notice An event thats emitted when a delegate account's vote balance changes
    event DelegateVotesChangedV2(address indexed delegate, uint256 previousBalance, uint256 newBalance);

    /// @notice Event emitted when tokens are updated
    event UpdateTokens(address token, bool isAdded);

    using SafeERC20Upgradeable for IERC20Upgradeable;

    constructor(address _token, bool _timeBased, uint256 _blocksPerYear) TimeManagerV8(_timeBased, _blocksPerYear) {
        ensureNonzeroAddress(_token);
        tokens[_token] = true;
    }

    /**
     * @notice Initialize the contract
     * @param _accessControlManager  Address of access control manager
     */
    function initialize(address _accessControlManager) external initializer {
        ensureNonzeroAddress(_accessControlManager);
        accessControlManager = _accessControlManager;
    }

    /**
     * @notice Update tokens supported by the vault
     * @param _token Address of token
     * @param _isAdded Bool value, should be true to add token
     * @custom:access Controlled by Access Control Manager
     * @custom:event Emit UpdateTokens with address of token and its bool value
     */
    function updateTokens(address _token, bool _isAdded) external {
        _ensureAllowed("updateTokens(address,bool)");
        ensureNonzeroAddress(address(_token));
        tokens[_token] = _isAdded;
        emit UpdateTokens(_token, _isAdded);
    }

    /**
     * @notice Deposit token to TokenVault
     * @param _token Address of token to be deposited
     * @param _amount Amount of token to be deposited
     * @custom:event Emit Deposit with msg.sender, token and amount
     */
    function deposit(address _token, uint256 _amount) external nonReentrant whenNotPaused {
        require(tokens[_token], "TokenVault::deposit: token is not registered");
        require(_amount > 0, "TokenVault::deposit: invalid amount");
        UserInfo storage user = userInfos[msg.sender][_token];
        IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);
        userInfos[msg.sender][_token].amount = user.amount + _amount;
        _moveDelegates(address(0), delegates[msg.sender], _amount, _token);
        emit Deposit(msg.sender, _token, _amount);
    }

    /**
     * @notice Execute withdrawal of given token
     * @param _token  Address of token to be withdrawal. It should be a registered token
     * @custom:event Emit ExecutedWithdrawal with msg.sender, token and withdrawal amount
     */
    function executeWithdrawal(address _token) external nonReentrant whenNotPaused {
        require(tokens[_token], "TokenVault::executeWithdrawal: token is not registered");
        UserInfo storage user = userInfos[msg.sender][_token];
        WithdrawalRequest[] storage requests = withdrawalRequests[msg.sender][_token];

        uint256 withdrawalAmount;

        withdrawalAmount = popEligibleWithdrawalRequests(user, requests);
        require(withdrawalAmount > 0, "nothing to withdraw");

        user.amount = user.amount - withdrawalAmount;
        IERC20Upgradeable(_token).safeTransfer(address(msg.sender), withdrawalAmount);
        totalPendingWithdrawals[_token] = totalPendingWithdrawals[_token] - withdrawalAmount;
        emit ExecutedWithdrawal(msg.sender, _token, withdrawalAmount);
    }

    /**
     * @notice Request withdrawal to TokenVault for token allocation
     * @param _token Address of token to be withdrawal
     * @param _amount The amount to withdraw from the vault
     * @custom:event Emit RequestedWithdrawal with msg.sender, token and withdrawal amount
     */
    function requestWithdrawal(address _token, uint256 _amount) external nonReentrant whenNotPaused {
        require(tokens[_token], "TokenVault::requestWithdrawal: token is not registered");
        require(_amount > 0, "TokenVault::requestWithdrawal: requested amount cannot be zero");
        UserInfo storage user = userInfos[_token][msg.sender];
        WithdrawalRequest[] storage requests = withdrawalRequests[_token][msg.sender];

        require(
            user.amount >= user.pendingWithdrawals + _amount,
            "TokenVault::requestWithdrawal: requested amount is invalid"
        );

        uint256 lockedUntil = tokenLockPeriod[_token] + block.timestamp;

        pushWithdrawalRequest(user, requests, _amount, lockedUntil);
        totalPendingWithdrawals[_token] = totalPendingWithdrawals[_token] + _amount;

        // Update Delegate Amount
        _moveDelegates(delegates[msg.sender], address(0), _amount, _token);

        emit RequestedWithdrawal(msg.sender, _token, _amount);
    }

    /**
     * @notice Get unlocked withdrawal amount
     * @param _token Address of token
     * @param _user The User Address
     * @return withdrawalAmount Amount that the user can withdraw
     */
    function getEligibleWithdrawalAmount(
        address _token,
        address _user
    ) external view returns (uint256 withdrawalAmount) {
        require(tokens[_token], "TokenVault::getEligibleWithdrawalAmount: token is not registered");
        WithdrawalRequest[] storage requests = withdrawalRequests[_token][_user];
        // Since the requests are sorted by their unlock time, we can take
        // the entries from the end of the array and stop at the first
        // not-yet-eligible one
        for (uint256 i = requests.length; i > 0 && isUnlocked(requests[i - 1]); --i) {
            withdrawalAmount = withdrawalAmount + requests[i - 1].amount;
        }
        return withdrawalAmount;
    }

    /**
     * @notice Get requested amount
     * @param _token Address of token
     * @param _user The User Address
     * @return Total amount of requested but not yet executed withdrawals (including both executable and locked ones)
     */
    function getRequestedAmount(address _token, address _user) external view returns (uint256) {
        require(tokens[_token], "TokenVault::getRequestedAmount: token is not reistered");
        UserInfo storage user = userInfos[_token][_user];
        return user.pendingWithdrawals;
    }

    /**
     * @notice Returns the array of withdrawal requests that have not been executed yet
     * @param _token Address of token
     * @param _user The User Address
     * @return An array of withdrawal requests
     */
    function getWithdrawalRequests(address _token, address _user) external view returns (WithdrawalRequest[] memory) {
        require(tokens[_token], "TokenVault::getWithdrawalRequests: token is not reistered");
        return withdrawalRequests[_token][_user];
    }

    /**
     * @notice Determine the token stake balance for an account
     * @param _account The address of the account to check
     * @param _blockNumberOrSecond The block number or second to get the vote balance at
     * @param _token Address of token
     * @return The balance that user staked
     */
    function getPriorVotes(
        address _account,
        uint256 _blockNumberOrSecond,
        address _token
    ) external view returns (uint256) {
        require(_blockNumberOrSecond < getBlockNumberOrTimestamp(), "TokenVault::getPriorVotes: not yet determined");

        uint32 nCheckpoints = numCheckpoints[_token][_account];
        if (nCheckpoints == 0) {
            return 0;
        }

        // First check most recent balance
        if (checkpoints[_token][_account][nCheckpoints - 1].fromBlockOrSecond <= _blockNumberOrSecond) {
            return checkpoints[_token][_account][nCheckpoints - 1].votes;
        }

        // Next check implicit zero balance
        if (checkpoints[_token][_account][0].fromBlockOrSecond > _blockNumberOrSecond) {
            return 0;
        }

        uint32 lower = 0;
        uint32 upper = nCheckpoints - 1;
        while (upper > lower) {
            uint32 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
            Checkpoint memory cp = checkpoints[_token][_account][center];
            if (cp.fromBlockOrSecond == _blockNumberOrSecond) {
                return cp.votes;
            } else if (cp.fromBlockOrSecond < _blockNumberOrSecond) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return checkpoints[_token][_account][lower].votes;
    }

    /**
     * @notice Get user info with reward token address and pid
     * @param _token Reward token address
     * @param _user User address
     * @return amount Deposited amount
     * @return pendingWithdrawals Requested but not yet executed withdrawals
     */
    function getUserInfo(
        address _token,
        address _user
    ) external view returns (uint256 amount, uint256 pendingWithdrawals) {
        require(tokens[_token], "TokenVault::getUserInfo: token is not reistered");
        UserInfo storage user = userInfos[_token][_user];
        amount = user.amount;
        pendingWithdrawals = user.pendingWithdrawals;
    }

    /**
     * @notice Delegate votes from `msg.sender` to `delegatee`
     * @param _delegatee The address to delegate votes to
     * @param _token Address of token
     */
    function delegate(address _delegatee, address _token) external whenNotPaused {
        return _delegate(msg.sender, _delegatee, _token);
    }

    /**
     * @notice Delegates votes from signatory to `delegatee`
     * @param _delegatee The address to delegate votes to
     * @param _nonce The contract state required to match the signature
     * @param _expiry The time at which to expire the signature
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function delegateBySig(
        address _delegatee,
        uint256 _nonce,
        uint256 _expiry,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address _token
    ) external whenNotPaused {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("XVSVault")), block.chainid, address(this))
        );
        bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, _delegatee, _nonce, _expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ECDSA.recover(digest, v, r, s);
        require(_nonce == nonces[signatory]++, "XVSVault::delegateBySig: invalid nonce");
        require(block.timestamp <= _expiry, "XVSVault::delegateBySig: signature expired");
        return _delegate(signatory, _delegatee, _token);
    }

    /**
     * @notice Set Access Control Manager
     * @param _accessControlManager Address of Access Control Manager
     */
    function setAccessControlManager(address _accessControlManager) external {
        _ensureAllowed("setAccessControlManager(address)");
        ensureNonzeroAddress(_accessControlManager);
        accessControlManager = _accessControlManager;
    }

    /**
     * @notice Gets the current votes balance for `account`
     * @param _account The address to get votes balance
     * @param _token Address of token
     * @return The number of current votes for `account`
     */
    function getCurrentVotes(address _account, address _token) external view returns (uint256) {
        uint32 nCheckpoints = numCheckpoints[_token][_account];
        return nCheckpoints > 0 ? checkpoints[_token][_account][nCheckpoints - 1].votes : 0;
    }

    /**
     * @notice Pushes withdrawal request to the requests array and updates
     *   the pending withdrawals amount. The requests are always sorted
     *   by unlock time (descending) so that the earliest to execute requests
     *   are always at the end of the array
     * @param _user The user struct storage pointer
     * @param _requests The user's requests array storage pointer
     * @param _amount The amount being requested
     */
    function pushWithdrawalRequest(
        UserInfo storage _user,
        WithdrawalRequest[] storage _requests,
        uint256 _amount,
        uint256 _lockedUntil
    ) internal {
        uint256 i = _requests.length;
        _requests.push(WithdrawalRequest(0, 0));
        // Keep it sorted so that the first to get unlocked request is always at the end
        for (; i > 0 && _requests[i - 1].lockedUntil <= _lockedUntil; ) {
            _requests[i] = _requests[i - 1];
            unchecked {
                --i;
            }
        }
        _requests[i] = WithdrawalRequest(_amount, uint128(_lockedUntil));
        _user.pendingWithdrawals = _user.pendingWithdrawals + _amount;
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
     * @return withdrawalAmount The amount eligible for withdrawal
     */
    function popEligibleWithdrawalRequests(
        UserInfo storage _user,
        WithdrawalRequest[] storage _requests
    ) internal returns (uint256 withdrawalAmount) {
        // Since the requests are sorted by their unlock time, we can just
        // pop them from the array and stop at the first not-yet-eligible one
        for (uint256 i = _requests.length; i > 0 && isUnlocked(_requests[i - 1]); ) {
            withdrawalAmount = withdrawalAmount + (_requests[i - 1].amount);

            _requests.pop();
            unchecked {
                --i;
            }
        }
        _user.pendingWithdrawals = _user.pendingWithdrawals - withdrawalAmount;
        return withdrawalAmount;
    }

    /**
     * @dev Delegate user votes
     * @param _delegator Address of delegator
     * @param _delegatee Address of delegatee
     * @param _token  Address of token
     * @custom:event Emit DelegateChangedV2 with current delegate, new delegatee and token
     */
    function _delegate(address _delegator, address _delegatee, address _token) internal {
        address currentDelegate = delegates[_delegator];
        uint256 delegatorBalance = getStakeAmount(_delegator, _token);
        delegates[_delegator] = _delegatee;

        emit DelegateChangedV2(_delegator, currentDelegate, _delegatee);

        _moveDelegates(currentDelegate, _delegatee, delegatorBalance, _token);
    }

    /**
     * @dev Internal function to moves voting power from one representative to another based on the given parameters
     * @param _srcRep The address of the current representative whose voting power is being transferred
     * @param _dstRep The address of the new representative who will receive the transferred voting power
     * @param _amount The amount of voting power to be transferred
     * @param _token The address of the token associated with the voting power
     */
    function _moveDelegates(address _srcRep, address _dstRep, uint256 _amount, address _token) internal {
        if (_srcRep != _dstRep && _amount > 0) {
            if (_srcRep != address(0)) {
                uint32 srcRepNum = numCheckpoints[_token][_srcRep];
                uint256 srcRepOld = srcRepNum > 0 ? checkpoints[_token][_srcRep][srcRepNum - 1].votes : 0;
                uint256 srcRepNew = srcRepOld - _amount;
                _writeCheckpoint(_srcRep, srcRepNum, srcRepOld, srcRepNew, _token);
            }

            if (_dstRep != address(0)) {
                uint32 dstRepNum = numCheckpoints[_token][_dstRep];
                uint256 dstRepOld = dstRepNum > 0 ? checkpoints[_token][_dstRep][dstRepNum - 1].votes : 0;
                uint256 dstRepNew = dstRepOld + _amount;
                _writeCheckpoint(_dstRep, dstRepNum, dstRepOld, dstRepNew, _token);
            }
        }
    }

    /**
     * @dev Updates the voting checkpoint for a delegatee with the given parameters
     * If there are existing checkpoints for the delegatee at the current block number or timestamp,
     * the function updates the votes in the most recent checkpoint
     * Otherwise, it creates a new checkpoint with the current block number or timestamp and the new votes
     * @param delegatee The address of the delegatee whose voting checkpoint is being updated
     * @param nCheckpoints The number of existing voting checkpoints for the delegatee
     * @param oldVotes The previous number of votes held by the delegatee
     * @param newVotes The new number of votes to be assigned to the delegatee
     * @param _token The address of the token associated with the voting power
     * @custom:event Emits a DelegateVotesChangedV2 event to signal the change in voting power for the delegatee
     */
    function _writeCheckpoint(
        address delegatee,
        uint32 nCheckpoints,
        uint256 oldVotes,
        uint256 newVotes,
        address _token
    ) internal {
        uint32 blockNumberOrSecond = uint32(getBlockNumberOrTimestamp());

        if (
            nCheckpoints > 0 &&
            checkpoints[_token][delegatee][nCheckpoints - 1].fromBlockOrSecond == blockNumberOrSecond
        ) {
            checkpoints[_token][delegatee][nCheckpoints - 1].votes = newVotes;
        } else {
            checkpoints[_token][delegatee][nCheckpoints] = Checkpoint(blockNumberOrSecond, newVotes);
            numCheckpoints[_token][delegatee] = nCheckpoints + 1;
        }

        emit DelegateVotesChangedV2(delegatee, oldVotes, newVotes);
    }

    /**
     * @dev Returns before and after upgrade pending withdrawal amount
     * @param _requests The user's requests array storage pointer
     * @return withdrawalAmount The amount eligible for withdrawal
     */
    function getRequestedWithdrawalAmount(
        WithdrawalRequest[] storage _requests
    ) internal view returns (uint256 withdrawalAmount) {
        for (uint256 i = _requests.length; i > 0; --i) {
            withdrawalAmount = withdrawalAmount + (_requests[i - 1].amount);
        }
        return withdrawalAmount;
    }

    /**
     * @notice Get the XVS stake balance of an account (excluding the pending withdrawals)
     * @param _account The address of the account to check
     * @param _token Address of token
     * @return The balance that user staked
     */
    function getStakeAmount(address _account, address _token) internal view returns (uint256) {
        require(tokens[_token], "TokenVault::getStakeAmount: token is not reistered");
        UserInfo storage user = userInfos[_token][_account];
        return user.amount - (user.pendingWithdrawals);
    }

    /**
     * @dev Ensure that the caller has permission to execute a specific function
     * @param functionSig_ Function signature to be checked for permission
     */
    function _ensureAllowed(string memory functionSig_) internal view {
        require(
            IAccessControlManagerV8(accessControlManager).isAllowedToCall(msg.sender, functionSig_),
            "access denied"
        );
    }

    /**
     * @dev Checks if the request is eligible for withdrawal.
     * @param _request The request struct storage pointer
     * @return True if the request is eligible for withdrawal, false otherwise
     */
    function isUnlocked(WithdrawalRequest storage _request) private view returns (bool) {
        return _request.lockedUntil <= block.timestamp;
    }
}
