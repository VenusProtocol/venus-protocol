pragma solidity 0.5.16;

import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./VRTVaultStorage.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV5.sol";

interface IVRTVaultProxy {
    function _acceptImplementation() external;

    function admin() external returns (address);
}

contract VRTVault is VRTVaultStorage, AccessControlledV5 {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice The upper bound for lastAccruingBlock. Close to year 3,000, considering 3 seconds per block. Used to avoid a value absurdly high
    uint256 public constant MAX_LAST_ACCRUING_BLOCK = 9999999999;

    /// @notice Event emitted when vault is paused
    event VaultPaused(address indexed admin);

    /// @notice Event emitted when vault is resumed after pause
    event VaultResumed(address indexed admin);

    /// @notice Event emitted on VRT deposit
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when accruedInterest and VRT PrincipalAmount is withrawn
    event Withdraw(
        address indexed user,
        uint256 withdrawnAmount,
        uint256 totalPrincipalAmount,
        uint256 accruedInterest
    );

    /// @notice Event emitted when Admin withdraw BEP20 token from contract
    event WithdrawToken(address indexed tokenAddress, address indexed receiver, uint256 amount);

    /// @notice Event emitted when accruedInterest is claimed
    event Claim(address indexed user, uint256 interestAmount);

    /// @notice Event emitted when lastAccruingBlock state variable changes
    event LastAccruingBlockChanged(uint256 oldLastAccruingBlock, uint256 newLastAccruingBlock);

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin allowed");
        _;
    }

    function initialize(address _vrtAddress, uint256 _interestRatePerBlock) public {
        require(msg.sender == admin, "only admin may initialize the Vault");
        require(_vrtAddress != address(0), "vrtAddress cannot be Zero");
        require(interestRatePerBlock == 0, "Vault may only be initialized once");

        // Set initial exchange rate
        interestRatePerBlock = _interestRatePerBlock;
        require(interestRatePerBlock > 0, "interestRate Per Block must be greater than zero.");

        // Set the VRT
        vrt = IBEP20(_vrtAddress);
        _notEntered = true;
    }

    modifier isInitialized() {
        require(interestRatePerBlock > 0, "Vault is not initialized");
        _;
    }

    modifier isActive() {
        require(!vaultPaused, "Vault is paused");
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

    modifier nonZeroAddress(address _address) {
        require(_address != address(0), "Address cannot be Zero");
        _;
    }

    modifier userHasPosition(address userAddress) {
        UserInfo storage user = userInfo[userAddress];
        require(user.userAddress != address(0), "User does not have any position in the Vault.");
        _;
    }

    /**
     * @notice Pause vault
     */
    function pause() external {
        _checkAccessAllowed("pause()");
        require(!vaultPaused, "Vault is already paused");
        vaultPaused = true;
        emit VaultPaused(msg.sender);
    }

    /**
     * @notice Resume vault
     */
    function resume() external {
        _checkAccessAllowed("resume()");
        require(vaultPaused, "Vault is not paused");
        vaultPaused = false;
        emit VaultResumed(msg.sender);
    }

    /**
     * @notice Deposit VRT to VRTVault for a fixed-interest-rate
     * @param depositAmount The amount to deposit to vault
     */
    function deposit(uint256 depositAmount) external nonReentrant isInitialized isActive {
        require(depositAmount > 0, "Deposit amount must be non-zero");

        address userAddress = msg.sender;
        UserInfo storage user = userInfo[userAddress];

        if (user.userAddress == address(0)) {
            user.userAddress = userAddress;
            user.totalPrincipalAmount = depositAmount;
        } else {
            // accrue Interest and transfer to the user
            uint256 accruedInterest = computeAccruedInterest(user.totalPrincipalAmount, user.accrualStartBlockNumber);

            user.totalPrincipalAmount = user.totalPrincipalAmount.add(depositAmount);

            if (accruedInterest > 0) {
                uint256 vrtBalance = vrt.balanceOf(address(this));
                require(
                    vrtBalance >= accruedInterest,
                    "Failed to transfer accruedInterest, Insufficient VRT in Vault."
                );
                emit Claim(userAddress, accruedInterest);
                vrt.safeTransfer(user.userAddress, accruedInterest);
            }
        }

        uint256 currentBlock_ = getBlockNumber();
        if (lastAccruingBlock > currentBlock_) {
            user.accrualStartBlockNumber = currentBlock_;
        } else {
            user.accrualStartBlockNumber = lastAccruingBlock;
        }
        emit Deposit(userAddress, depositAmount);
        vrt.safeTransferFrom(userAddress, address(this), depositAmount);
    }

    /**
     * @notice get accruedInterest of the user's VRTDeposits in the Vault
     * @param userAddress Address of User in the the Vault
     * @return The interest accrued, in VRT
     */
    function getAccruedInterest(
        address userAddress
    ) public view nonZeroAddress(userAddress) isInitialized returns (uint256) {
        UserInfo storage user = userInfo[userAddress];
        if (user.accrualStartBlockNumber == 0) {
            return 0;
        }

        return computeAccruedInterest(user.totalPrincipalAmount, user.accrualStartBlockNumber);
    }

    /**
     * @notice get accruedInterest of the user's VRTDeposits in the Vault
     * @param totalPrincipalAmount of the User
     * @param accrualStartBlockNumber of the User
     * @return The interest accrued, in VRT
     */
    function computeAccruedInterest(
        uint256 totalPrincipalAmount,
        uint256 accrualStartBlockNumber
    ) internal view isInitialized returns (uint256) {
        uint256 blockNumber = getBlockNumber();
        uint256 _lastAccruingBlock = lastAccruingBlock;

        if (blockNumber > _lastAccruingBlock) {
            blockNumber = _lastAccruingBlock;
        }

        if (accrualStartBlockNumber == 0 || accrualStartBlockNumber >= blockNumber) {
            return 0;
        }

        // Number of blocks since deposit
        uint256 blockDelta = blockNumber.sub(accrualStartBlockNumber);
        uint256 accruedInterest = (totalPrincipalAmount.mul(interestRatePerBlock).mul(blockDelta)).div(1e18);
        return accruedInterest;
    }

    /**
     * @notice claim the accruedInterest of the user's VRTDeposits in the Vault
     */
    function claim() external nonReentrant isInitialized userHasPosition(msg.sender) isActive {
        _claim(msg.sender);
    }

    /**
     * @notice claim the accruedInterest of the user's VRTDeposits in the Vault
     * @param account The account for which to claim rewards
     */
    function claim(address account) external nonReentrant isInitialized userHasPosition(account) isActive {
        _claim(account);
    }

    /**
     * @notice Low level claim function
     * @param account The account for which to claim rewards
     */
    function _claim(address account) internal {
        uint256 accruedInterest = getAccruedInterest(account);
        if (accruedInterest > 0) {
            UserInfo storage user = userInfo[account];
            uint256 vrtBalance = vrt.balanceOf(address(this));
            require(vrtBalance >= accruedInterest, "Failed to transfer VRT, Insufficient VRT in Vault.");
            emit Claim(account, accruedInterest);
            uint256 currentBlock_ = getBlockNumber();
            if (lastAccruingBlock > currentBlock_) {
                user.accrualStartBlockNumber = currentBlock_;
            } else {
                user.accrualStartBlockNumber = lastAccruingBlock;
            }
            vrt.safeTransfer(user.userAddress, accruedInterest);
        }
    }

    /**
     * @notice withdraw accruedInterest and totalPrincipalAmount of the user's VRTDeposit in the Vault
     */
    function withdraw() external nonReentrant isInitialized userHasPosition(msg.sender) isActive {
        address userAddress = msg.sender;
        uint256 accruedInterest = getAccruedInterest(userAddress);

        UserInfo storage user = userInfo[userAddress];

        uint256 totalPrincipalAmount = user.totalPrincipalAmount;
        uint256 vrtForWithdrawal = accruedInterest.add(totalPrincipalAmount);
        user.totalPrincipalAmount = 0;
        user.accrualStartBlockNumber = getBlockNumber();

        uint256 vrtBalance = vrt.balanceOf(address(this));
        require(vrtBalance >= vrtForWithdrawal, "Failed to transfer VRT, Insufficient VRT in Vault.");

        emit Withdraw(userAddress, vrtForWithdrawal, totalPrincipalAmount, accruedInterest);
        vrt.safeTransfer(user.userAddress, vrtForWithdrawal);
    }

    /**
     * @notice withdraw BEP20 tokens from the contract to a recipient address.
     * @param tokenAddress address of the BEP20 token
     * @param receiver recipient of the BEP20 token
     * @param amount tokenAmount
     */
    function withdrawBep20(
        address tokenAddress,
        address receiver,
        uint256 amount
    ) external isInitialized nonZeroAddress(tokenAddress) nonZeroAddress(receiver) {
        _checkAccessAllowed("withdrawBep20(address,address,uint256)");
        require(amount > 0, "amount is invalid");
        IBEP20 token = IBEP20(tokenAddress);
        require(amount <= token.balanceOf(address(this)), "Insufficient amount in Vault");
        emit WithdrawToken(tokenAddress, receiver, amount);
        token.safeTransfer(receiver, amount);
    }

    function setLastAccruingBlock(uint256 _lastAccruingBlock) external {
        _checkAccessAllowed("setLastAccruingBlock(uint256)");
        require(_lastAccruingBlock < MAX_LAST_ACCRUING_BLOCK, "_lastAccruingBlock is absurdly high");

        uint256 oldLastAccruingBlock = lastAccruingBlock;
        uint256 currentBlock = getBlockNumber();
        if (oldLastAccruingBlock != 0) {
            require(currentBlock < oldLastAccruingBlock, "Cannot change at this point");
        }
        if (oldLastAccruingBlock == 0 || _lastAccruingBlock < oldLastAccruingBlock) {
            // Must be in future
            require(currentBlock < _lastAccruingBlock, "Invalid _lastAccruingBlock interest have been accumulated");
        }
        lastAccruingBlock = _lastAccruingBlock;
        emit LastAccruingBlockChanged(oldLastAccruingBlock, _lastAccruingBlock);
    }

    function getBlockNumber() public view returns (uint256) {
        return block.number;
    }

    /*** Admin Functions ***/

    function _become(IVRTVaultProxy vrtVaultProxy) external {
        require(msg.sender == vrtVaultProxy.admin(), "only proxy admin can change brains");
        vrtVaultProxy._acceptImplementation();
    }

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Admin function to set the access control address
     * @param newAccessControlAddress New address for the access control
     */
    function setAccessControl(address newAccessControlAddress) external onlyAdmin {
        _setAccessControlManager(newAccessControlAddress);
    }
}
