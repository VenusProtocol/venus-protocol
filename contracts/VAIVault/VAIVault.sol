pragma solidity 0.5.16;

import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./VAIVaultStorage.sol";
import "./VAIVaultErrorReporter.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV5.sol";
import { VAIVaultProxy } from "./VAIVaultProxy.sol";

/**
 * @title VAI Vault
 * @author Venus
 * @notice The VAI Vault is configured for users to stake VAI And receive XVS as a reward.
 */
contract VAIVault is VAIVaultStorage, AccessControlledV5 {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice Event emitted when VAI deposit
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when VAI withrawal
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Event emitted when vault is paused
    event VaultPaused(address indexed admin);

    /// @notice Event emitted when vault is resumed after pause
    event VaultResumed(address indexed admin);

    constructor() public {
        admin = msg.sender;
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
     * @dev Prevents functions to execute when vault is paused.
     */
    modifier isActive() {
        require(!vaultPaused, "Vault is paused");
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
     * @notice Deposit VAI to VAIVault for XVS allocation
     * @param _amount The amount to deposit to vault
     */
    function deposit(uint256 _amount) external nonReentrant isActive {
        UserInfo storage user = userInfo[msg.sender];

        updateVault();

        // Transfer pending tokens to user
        updateAndPayOutPending(msg.sender);

        // Transfer in the amounts from user
        if (_amount > 0) {
            vai.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }

        user.rewardDebt = user.amount.mul(accXVSPerShare).div(1e18);
        emit Deposit(msg.sender, _amount);
    }

    /**
     * @notice Withdraw VAI from VAIVault
     * @param _amount The amount to withdraw from vault
     */
    function withdraw(uint256 _amount) external nonReentrant isActive {
        _withdraw(msg.sender, _amount);
    }

    /**
     * @notice Claim XVS from VAIVault
     */
    function claim() external nonReentrant isActive {
        _withdraw(msg.sender, 0);
    }

    /**
     * @notice Claim XVS from VAIVault
     * @param account The account for which to claim XVS
     */
    function claim(address account) external nonReentrant isActive {
        _withdraw(account, 0);
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

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            vai.safeTransfer(address(account), _amount);
        }
        user.rewardDebt = user.amount.mul(accXVSPerShare).div(1e18);

        emit Withdraw(account, _amount);
    }

    /**
     * @notice View function to see pending XVS on frontend
     * @param _user The user to see pending XVS
     * @return Amount of XVS the user can claim
     */
    function pendingXVS(address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_user];

        return user.amount.mul(accXVSPerShare).div(1e18).sub(user.rewardDebt);
    }

    /**
     * @notice Update and pay out pending XVS to user
     * @param account The user to pay out
     */
    function updateAndPayOutPending(address account) internal {
        uint256 pending = pendingXVS(account);

        if (pending > 0) {
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
    function updatePendingRewards() public isActive {
        uint256 newRewards = xvs.balanceOf(address(this)).sub(xvsBalance);

        if (newRewards > 0) {
            xvsBalance = xvs.balanceOf(address(this)); // If there is no change the balance didn't change
            pendingRewards = pendingRewards.add(newRewards);
        }
    }

    /**
     * @notice Update reward variables to be up-to-date
     */
    function updateVault() internal {
        updatePendingRewards();

        uint256 vaiBalance = vai.balanceOf(address(this));
        if (vaiBalance == 0) {
            // avoids division by 0 errors
            return;
        }

        accXVSPerShare = accXVSPerShare.add(pendingRewards.mul(1e18).div(vaiBalance));
        pendingRewards = 0;
    }

    /*** Admin Functions ***/

    function _become(VAIVaultProxy vaiVaultProxy) external {
        require(msg.sender == vaiVaultProxy.admin(), "only proxy admin can change brains");
        require(vaiVaultProxy._acceptImplementation() == 0, "change not authorized");
    }

    function setVenusInfo(address _xvs, address _vai) external onlyAdmin {
        require(_xvs != address(0) && _vai != address(0), "addresses must not be zero");
        require(address(xvs) == address(0) && address(vai) == address(0), "addresses already set");
        xvs = IBEP20(_xvs);
        vai = IBEP20(_vai);

        _notEntered = true;
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
