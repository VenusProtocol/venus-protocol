pragma solidity ^0.5.16;

// ----------------------------------------------------------------------------
// 'SXP' 'Swipe' BEP20 token contract
//
// Symbol      : SXP
// Name        : Swipe
// Total supply: 289,714,926.000000000000000000
// Decimals    : 18
// Website     : https://swipe.io
//
// ----------------------------------------------------------------------------

import "../SafeMath.sol";
import "../Ownable.sol";
import "../BEP20Interface.sol";

contract Tokenlock is Ownable {
    /// @notice Indicates if token is locked
    uint8 isLocked = 0;

    event Freezed();
    event UnFreezed();

    modifier validLock {
        require(isLocked == 0, "Token is locked");
        _;
    }

    function freeze() public onlyOwner {
        isLocked = 1;

        emit Freezed();
    }

    function unfreeze() public onlyOwner {
        isLocked = 0;

        emit UnFreezed();
    }
}

// ----------------------------------------------------------------------------
// Contract function to receive approval and execute function in one call
//
// Borrowed from MiniMeToken
// ----------------------------------------------------------------------------
contract ApproveAndCallFallBack {
    function receiveApproval(address from, uint256 tokens, address token, bytes memory data) public;
}

// ----------------------------------------------------------------------------
// Limit users in blacklist
// ----------------------------------------------------------------------------
contract UserLock is Ownable {
    mapping(address => bool) blacklist;

    event LockUser(address indexed who);
    event UnlockUser(address indexed who);

    modifier permissionCheck {
        require(!blacklist[msg.sender], "Blocked user");
        _;
    }

    function lockUser(address who) public onlyOwner {
        blacklist[who] = true;

        emit LockUser(who);
    }

    function unlockUser(address who) public onlyOwner {
        blacklist[who] = false;

        emit UnlockUser(who);
    }
}

contract SXP is BEP20Interface, Tokenlock, UserLock {
    using SafeMath for uint256;

    /// @notice Official record of token balances for each account
    mapping (address => uint256) private _balances;

    /// @notice Allowance amounts on behalf of others
    mapping (address => mapping (address => uint256)) private _allowances;

    /// @notice Total number of tokens in circulation
    uint256 private _totalSupply;

    /// @notice BEP-20 token decimals for this token
    uint8 private _decimals;

    /// @notice BEP-20 token symbol for this token
    string private _symbol;

    /// @notice BEP-20 token name for this token
    string private _name;

    /// @notice A record of each accounts delegate
    mapping (address => address) public delegates;

    /// @notice A checkpoint for marking number of votes from a given block
    struct Checkpoint {
        uint32 fromBlock;
        uint256 votes;
    }

    /// @notice A record of votes checkpoints for each account, by index
    mapping (address => mapping (uint32 => Checkpoint)) public checkpoints;

    /// @notice The number of checkpoints for each account
    mapping (address => uint32) public numCheckpoints;

    /// @notice The EIP-712 typehash for the contract's domain
    bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");

    /// @notice The EIP-712 typehash for the delegation struct used by the contract
    bytes32 public constant DELEGATION_TYPEHASH = keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

    /// @notice A record of states for signing / validating signatures
    mapping (address => uint256) public nonces;

    /// @notice An event thats emitted when an account changes its delegate
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);

    /// @notice An event thats emitted when a delegate account's vote balance changes
    event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance);

    /// @notice The standard BEP-20 transfer event
    event Transfer(address indexed from, address indexed to, uint256 amount);

    /// @notice The standard BEP-20 approval event
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /**
     * @notice Construct a new SXP token
     * @param account The initial account to grant all the tokens
     */
    constructor(address account) public {
        _name = "Swipe";
        _symbol = "SXP";
        _decimals = 18;
        _totalSupply = 289714926e18;
        _balances[account] = _totalSupply;

        emit Transfer(address(0), account, _totalSupply);
    }

    /**
     * @dev Returns the bep token owner.
    */
    function getOwner() external view returns (address) {
        return owner();
    }

    /**
     * @dev Returns the token decimals.
    */
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Returns the token symbol.
    */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the token name.
    */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the total supply.
    */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Get the number of tokens held by the `account`
     * @param account The address of the account to get the balance of
     * @return The number of tokens held
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Transfer `amount` tokens from `msg.sender` to `dst`
     * @param recipient The address of the destination account
     * @param amount The number of tokens to transfer
     * @return Whether or not the transfer succeeded
     */
    function transfer(address recipient, uint256 amount) external validLock permissionCheck returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @notice Get the number of tokens `spender` is approved to spend on behalf of `account`
     * @param owner The address of the account holding the funds
     * @param spender The address of the account spending the funds
     * @return The number of tokens approved
     */
    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @notice Approve `spender` to transfer up to `amount` from `src`
     * @dev This will overwrite the approval amount for `spender`
     * @param spender The address of the account which may transfer tokens
     * @param amount The number of tokens that are approved (2^256-1 means infinite)
     * @return Whether or not the approval succeeded
     */
    function approve(address spender, uint256 amount) external validLock permissionCheck returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    /**
     * @notice Approve the spender to transferFrom(...) with the amount.
     * @dev receiveApproval(...) is executed.
     * @param amount The number of tokens that are approved
     * @param data The data to pass to receiveApproval(...)
     * @return true
     */
    function approveAndCall(address spender, uint256 amount, bytes memory data) public validLock permissionCheck returns (bool) {
        _approve(_msgSender(), spender, amount);
        ApproveAndCallFallBack(spender).receiveApproval(_msgSender(), amount, address(this), data);
        return true;
    }

    /**
     * @notice Transfer `amount` tokens from `src` to `dst`
     * @param sender The address of the source account
     * @param recipient The address of the destination account
     * @param amount The number of tokens to transfer
     * @return Whether or not the transfer succeeded
     */
    function transferFrom(address sender, address recipient, uint256 amount) external validLock permissionCheck returns (bool) {
        _transfer(sender, recipient, amount);
        address spender = _msgSender();
        uint256 spenderAllowance = _allowances[sender][spender];
        if (spenderAllowance != uint256(-1)) {
            _approve(sender, spender, spenderAllowance.sub(amount, "The transfer amount exceeds allowance"));
        }
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `spender` by the caller
     * @dev This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {BEP20-approve}.
     * @param spender The address of the account which may transfer tokens
     * @param addedValue The additional number of tokens to allow which may be spent
     * @return Whether or not the approval succeeded
     */
    function increaseAllowance(address spender, uint256 addedValue) public validLock permissionCheck returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].add(addedValue, "The increased allowance overflows"));
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `spender` by the caller
     * @dev This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {BEP20-approve}.
     * @param spender The address of the account which may transfer tokens
     * @param subtractedValue The subtractional number of tokens to allow which may be spent
     * @return Whether or not the approval succeeded
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public validLock permissionCheck returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].sub(subtractedValue, "The decreased allowance below zero"));
        return true;
    }

    /**
     * @notice Destroy the amount of tokens from the sender, reducing the total supply.
     * @dev The amount must be greater than balance, total supply.
     * @param amount The number of tokens that are burnt
     * @return true
     */
    function burn(uint256 amount) public validLock permissionCheck returns (bool) {
        _burn(_msgSender(), amount);
        return true;
    }

    /**
     * @notice Delegate votes from `msg.sender` to `delegatee`
     * @param delegatee The address to delegate votes to
     */
    function delegate(address delegatee) public validLock permissionCheck {
        return _delegate(_msgSender(), delegatee);
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
    function delegateBySig(address delegatee, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s) public validLock permissionCheck {
        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(_name)), getChainId(), address(this)));
        bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "Invalid signature");
        require(nonce == nonces[signatory]++, "Invalid nonce");
        require(now <= expiry, "The signature expired");
        return _delegate(signatory, delegatee);
    }

    /**
     * @notice Gets the current votes balance for `account`
     * @param account The address to get votes balance
     * @return The number of current votes for `account`
     */
    function getCurrentVotes(address account) external view returns (uint96) {
        uint32 nCheckpoints = numCheckpoints[account];
        return nCheckpoints > 0 ? ceil96(checkpoints[account][nCheckpoints - 1].votes) : 0;
    }

    /**
     * @notice Determine the prior number of votes for an account as of a block number
     * @dev Block number must be a finalized block or else this function will revert to prevent misinformation.
     * @param account The address of the account to check
     * @param blockNumber The block number to get the vote balance at
     * @return The number of votes the account had as of the given block
     */
    function getPriorVotes(address account, uint256 blockNumber) public view returns (uint96) {
        require(blockNumber < block.number, "Not determined yet");

        uint32 nCheckpoints = numCheckpoints[account];
        if (nCheckpoints == 0) {
            return 0;
        }

        // First check most recent balance
        if (checkpoints[account][nCheckpoints - 1].fromBlock <= blockNumber) {
            return ceil96(checkpoints[account][nCheckpoints - 1].votes);
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
                return ceil96(cp.votes);
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return ceil96(checkpoints[account][lower].votes);
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "Cannot transfer from the zero address");
        require(recipient != address(0), "Cannot transfer to the zero address");

        _balances[sender] = _balances[sender].sub(amount, "The transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount, "The balance overflows");
        emit Transfer(sender, recipient, amount);

        _moveDelegates(delegates[sender], delegates[recipient], amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "Cannot approve from the zero address");
        require(spender != address(0), "Cannot approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _burn(address account, uint256 amount) internal {
        require(account != address(0), "Cannot burn from the zero address");

        _balances[account] = _balances[account].sub(amount, "The burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);

        _moveDelegates(delegates[account], address(0), amount);
    }

    function _delegate(address delegator, address delegatee) internal {
        address currentDelegate = delegates[delegator];
        uint256 delegatorBalance = _balances[delegator];
        delegates[delegator] = delegatee;

        emit DelegateChanged(delegator, currentDelegate, delegatee);

        _moveDelegates(currentDelegate, delegatee, delegatorBalance);
    }

    function _moveDelegates(address srcRep, address dstRep, uint256 amount) internal {
        if (srcRep != dstRep && amount > 0) {
            if (srcRep != address(0)) {
                uint32 srcRepNum = numCheckpoints[srcRep];
                uint256 srcRepOld = srcRepNum > 0 ? checkpoints[srcRep][srcRepNum - 1].votes : 0;
                uint256 srcRepNew = srcRepOld.sub(amount, "The vote amount underflows");
                _writeCheckpoint(srcRep, srcRepNum, srcRepOld, srcRepNew);
            }

            if (dstRep != address(0)) {
                uint32 dstRepNum = numCheckpoints[dstRep];
                uint256 dstRepOld = dstRepNum > 0 ? checkpoints[dstRep][dstRepNum - 1].votes : 0;
                uint256 dstRepNew = dstRepOld.add(amount, "The vote amount overflows");
                _writeCheckpoint(dstRep, dstRepNum, dstRepOld, dstRepNew);
            }
        }
    }

    function _writeCheckpoint(address delegatee, uint32 nCheckpoints, uint256 oldVotes, uint256 newVotes) internal {
      uint32 blockNumber = safe32(block.number, "The block number exceeds 32 bits");

      if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1].fromBlock == blockNumber) {
          checkpoints[delegatee][nCheckpoints - 1].votes = newVotes;
      } else {
          checkpoints[delegatee][nCheckpoints] = Checkpoint(blockNumber, newVotes);
          numCheckpoints[delegatee] = nCheckpoints + 1;
      }

      emit DelegateVotesChanged(delegatee, oldVotes, newVotes);
    }

    function safe32(uint256 n, string memory errorMessage) internal pure returns (uint32) {
        require(n < 2**32, errorMessage);
        return uint32(n);
    }

    function ceil96(uint256 n) internal pure returns (uint96) {
        if (n >= 2**96) {
            return uint96(-1);
        }
        return uint96(n);
    }

    function getChainId() internal pure returns (uint256) {
        uint256 chainId;
        assembly { chainId := chainid() }
        return chainId;
    }
}
