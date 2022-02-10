pragma solidity ^0.5.16;

import "../Utils/SafeBEP20.sol";
import "../Utils/IBEP20.sol";
import "./VRTVaultProxy.sol";
import "./VRTVaultStorage.sol";
import "./VRTVaultErrorReporter.sol";

contract VRTVault is VRTVaultStorage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice Event emitted when admin changed
    event AdminTransfered(address indexed oldAdmin, address indexed newAdmin);

    /// @notice Event emitted on VRT deposit
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when accruedInterest and VRT PrincipalAmount is withrawn
    event Withdraw(address indexed user, uint256 withdrawnAmount, uint256 totalPrincipalAmount, uint256 accruedInterest);

    /// @notice Event emitted when Admin withdraw BEP20 token from contract
    event WithdrawToken(address indexed tokenAddress, address indexed receiver, uint256 amount);

    /// @notice Event emitted when accruedInterest is claimed
    event Claim(address indexed user, uint256 interestAmount);

    constructor(address _vrtAddress, uint256 _interestRatePerBlock) public {
        require(_interestRatePerBlock > 0 , "invalid interestRatePerBlock");
        admin = msg.sender;
        vrt = IBEP20(_vrtAddress);
        interestRatePerBlock = _interestRatePerBlock;
        _notEntered = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier nonZeroAddress(address _address) {
        require(_address != address(0), "Address cannot be Zero");
        _;
    }

    modifier userHasPosition(address userAddress) {
        UserInfo storage user = userInfo[userAddress];
        require(user.userAddress != address(0), "User doesnot have any position in the Vault.");
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
     * @notice Deposit VRT to VRTVault for a fixed-interest-rate
     * @param depositAmount The amount to deposit to vault
     */
    function deposit(address userAddress, uint256 depositAmount) public nonReentrant nonZeroAddress(userAddress) {
        require(depositAmount > 0, "Deposit amount must be non-zero");

        UserInfo storage user = userInfo[userAddress];

        if(user.userAddress == address(0)){
            user.userAddress = userAddress;
            user.totalPrincipalAmount = depositAmount;
        } else{
            // accrue Interest and transfer to the user
            uint256 accruedInterest = computeAccruedInterest(user.totalPrincipalAmount, user.accrualStartBlockNumber);

            user.totalPrincipalAmount = user.totalPrincipalAmount.add(depositAmount);

            if(accruedInterest > 0){
                uint256 vrtBalance = vrt.balanceOf(address(this));
                require(vrtBalance >= accruedInterest, "Failed to transfer accruedInterest, Insufficient VRT in Vault.");
                user.totalInterestAmount = user.totalInterestAmount.add(accruedInterest);
                emit Claim(userAddress, accruedInterest);
                vrt.safeTransferFrom(address(this), user.userAddress, accruedInterest);
            }
        }

        user.accrualStartBlockNumber = getBlockNumber();
        emit Deposit(userAddress, depositAmount);
        vrt.transferFrom(userAddress, address(this), depositAmount);
    }

    /**
     * @notice get accruedInterest of the user's VRTDeposits in the Vault
     * @param userAddress Address of User in the the Vault
     */
    function getAccruedInterest(address userAddress) public view nonZeroAddress(userAddress) returns (uint256) {
        UserInfo memory user = userInfo[userAddress];
        if(user.accrualStartBlockNumber == 0){
            return 0;
        }

        return computeAccruedInterest(user.totalPrincipalAmount, user.accrualStartBlockNumber);
    }

    /**
     * @notice get accruedInterest of the user's VRTDeposits in the Vault
     * @param totalPrincipalAmount of the User
     * @param accrualStartBlockNumber of the User
     */
    function computeAccruedInterest(uint256 totalPrincipalAmount, uint256 accrualStartBlockNumber) internal view returns (uint256) {
        
        uint256 blockNumber = getBlockNumber();

        if(accrualStartBlockNumber == 0 || accrualStartBlockNumber == blockNumber){
            return 0;
        }

        //number of blocks Since Deposit
        uint256 blockDelta = blockNumber.sub(accrualStartBlockNumber);
        uint256 accruedInterest = (totalPrincipalAmount.mul(interestRatePerBlock).mul(blockDelta)).div(1e18);
        return accruedInterest;
    }

    /**
     * @notice claim the accruedInterest of the user's VRTDeposits in the Vault
     * @param userAddress Address of User in the the Vault
     */
    function claim(address userAddress) external nonReentrant nonZeroAddress(userAddress) userHasPosition(userAddress) {
        uint256 accruedInterest = getAccruedInterest(userAddress);

        if(accruedInterest > 0){
            UserInfo storage user = userInfo[userAddress];
            user.totalInterestAmount = user.totalInterestAmount.add(accruedInterest);
            uint256 vrtBalance = vrt.balanceOf(address(this));
            require(vrtBalance >= accruedInterest, "Failed to transfer VRT, Insufficient VRT in Vault.");
            emit Claim(userAddress, accruedInterest);
            user.accrualStartBlockNumber = getBlockNumber();
            vrt.safeTransferFrom(address(this), user.userAddress, accruedInterest);
        }
    }

    /**
     * @notice withdraw accruedInterest and totalPrincipalAmount of the user's VRTDeposit in the Vault
     * @param userAddress Address of User in the the Vault
     */
    function withdraw(address userAddress) external nonReentrant nonZeroAddress(userAddress) userHasPosition(userAddress) {
        uint256 accruedInterest = getAccruedInterest(userAddress);

        UserInfo storage user = userInfo[userAddress];

        if(accruedInterest > 0){
            user.totalInterestAmount = user.totalInterestAmount.add(accruedInterest);
        }

        uint256 totalPrincipalAmount = user.totalPrincipalAmount;
        uint256 vrtForWithdrawal = accruedInterest.add(totalPrincipalAmount);

        uint256 vrtBalance = vrt.balanceOf(address(this));
        require(vrtBalance >= vrtForWithdrawal, "Failed to transfer VRT, Insufficient VRT in Vault.");

        emit Withdraw(userAddress, vrtForWithdrawal, totalPrincipalAmount, accruedInterest);
        vrt.safeTransferFrom(address(this), user.userAddress, vrtForWithdrawal);
    }

    /**
     * @notice withdraw BEP20 tokens from the contract to a recipient address.
     * @param tokenAddress address of the BEP20 token
     * @param receiver recipient of the BEP20 token
     * @param amount tokenAmount
     */
    function withdrawBep20(address tokenAddress, address receiver, uint256 amount) onlyAdmin nonZeroAddress(tokenAddress) nonZeroAddress(receiver) public {
        require(amount > 0 , "amount is invalid");
        IBEP20 token = IBEP20(tokenAddress);
        require(amount <= token.balanceOf(address(this)), "Insufficient amount in Vault");
        emit WithdrawToken(tokenAddress, receiver, amount);
        token.safeTransferFrom(address(this), receiver, amount);
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

    /*** Admin Functions ***/

    function _become(VRTVaultProxy vrtVaultProxy) public {
        require(msg.sender == vrtVaultProxy.admin(), "only proxy admin can change brains");
        require(vrtVaultProxy._acceptImplementation() == 0, "change not authorized");
    }

    function setVenusInfo(address _vrt) public onlyAdmin {
        vrt = IBEP20(_vrt);

        _notEntered = true;
    }

    function getBlockNumber() public view returns (uint256) {
        return block.number;
    }
}
