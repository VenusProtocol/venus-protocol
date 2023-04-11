// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

interface VAI {
    function balanceOf(address usr) external returns (uint256);

    function transferFrom(address src, address dst, uint amount) external returns (bool);

    function mint(address usr, uint wad) external;

    function burn(address usr, uint wad) external;
}

// NOTE: WE ASSUME that VAI and stableToken both have 18 decimal places which is the case for BSC

contract PegStability is AccessControlledV8, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Helper enum for calculation of the fee
    enum FeeDirection {
        IN,
        OUT
    }
    address public immutable vaiAddress;
    address public immutable stableTokenAddress;
    address public venusTreasury;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000; // fee is in basis points
    uint256 public feeIn; // incoming VAI fee
    uint256 public feeOut; // outgoing VAI fee
    uint256 public vaiMintCap; // max amount of VAI that can be minted through this contract
    uint256 public vaiMinted;
    bool public isPaused;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @notice Event emitted when contract is paused
    event PSMPaused(address indexed admin);

    /// @notice Event emitted when the contract is resumed after pause
    event PSMResumed(address indexed admin);

    /// @notice Event emitted when feeIn state var is modified
    event FeeInChanged(uint256 oldFeeIn, uint256 newFeeIn);

    /// @notice Event emitted when feeOut state var is modified
    event FeeOutChanged(uint256 oldFeeOut, uint256 newFeeOut);

    /// @notice Event emitted when vaiMintCap state var is modified
    event VaiMintCapChanged(uint256 oldCap, uint256 newCap);

    /// @notice Event emitted when venusTreasury state var is modified
    event VenusTreasuryChanged(address oldTreasury, address newTreasury);

    /// @notice Event emitted when stable token is swapped for VAI
    event StableForVAISwapped(uint256 stableIn, uint256 vaiOut);

    /// @notice Event emitted when stable token is swapped for VAI
    event VaiForStableSwapped(uint256 vaiIn, uint256 stableOut);

    /**
     * @dev Prevents functions to execute when contract is paused.
     */
    modifier isActive() {
        require(isPaused == false, "Contract is paused");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address stableTokenAddress_, address vaiAddress_) {
        ensureNonzeroAddress(stableTokenAddress_);
        ensureNonzeroAddress(vaiAddress_);
        stableTokenAddress = stableTokenAddress_;
        vaiAddress = vaiAddress_;
        _disableInitializers();
    }

    function initialize(
        address accessControlManager_,
        address venusTreasury_,
        uint256 feeIn_,
        uint256 feeOut_,
        uint256 vaiMintCap_
    ) external initializer {
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(venusTreasury_);
        __AccessControlled_init(accessControlManager_);
        feeIn = feeIn_;
        feeOut = feeOut_;
        vaiMintCap = vaiMintCap_;
        venusTreasury = venusTreasury_;
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "can't be zero address");
    }

    /*** Swap Functions ***/

    function swapVAIForStable(address receiver, uint256 stableTknAmount) external isActive {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero");
        uint256 fee = _calculateFee(stableTknAmount, FeeDirection.OUT);
        require(VAI(vaiAddress).balanceOf(msg.sender) >= stableTknAmount + fee, "not enought VAI");
        bool success = VAI(vaiAddress).transferFrom(msg.sender, venusTreasury, fee);
        require(success, "VAI fee transfer failed");
        VAI(vaiAddress).burn(msg.sender, stableTknAmount);
        vaiMinted -= stableTknAmount;
        IERC20Upgradeable(stableTokenAddress).safeTransferFrom(address(this), receiver, stableTknAmount);
        emit VaiForStableSwapped(stableTknAmount + fee, stableTknAmount);
    }

    function swapStableForVAI(address receiver, uint256 stableTknAmount) external isActive {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero");
        uint256 balanceBefore = IERC20Upgradeable(stableTokenAddress).balanceOf(address(this));
        IERC20Upgradeable(stableTokenAddress).safeTransferFrom(msg.sender, address(this), stableTknAmount);
        uint256 balanceAfter = IERC20Upgradeable(stableTokenAddress).balanceOf(address(this));
        uint256 actualTransferAmt = balanceAfter - balanceBefore;
        //calculate feeIn
        uint256 fee = _calculateFee(actualTransferAmt, FeeDirection.IN);
        uint256 vaiToMint = actualTransferAmt - fee;
        require(vaiMinted + actualTransferAmt <= vaiMintCap, "VAI min cap reached");
        vaiMintCap += actualTransferAmt;
        // mint VAI to receiver
        VAI(vaiAddress).mint(receiver, vaiToMint);
        // mint VAI fee to venus treasury
        VAI(vaiAddress).mint(venusTreasury, fee);
        emit StableForVAISwapped(stableTknAmount, vaiToMint + fee);
    }

    /*** Helper Functions ***/

    function _calculateFee(uint256 amount, FeeDirection direction) internal view returns (uint256) {
        uint256 feePercent;
        if (direction == FeeDirection.IN) {
            feePercent = feeIn;
        } else {
            feePercent = feeOut;
        }
        if (feePercent == 0) {
            return amount;
        } else {
            // checking if the percent calculation will result in rounding down to 0
            require(amount * feePercent >= BASIS_POINTS_DIVISOR, "amount too small");
            return (amount * feePercent) / BASIS_POINTS_DIVISOR;
        }
    }

    /*** Admin Functions ***/

    function pause() external {
        _checkAccessAllowed("pause()");
        require(isPaused == false, "PSM is already paused");
        isPaused = true;
        emit PSMPaused(msg.sender);
    }

    function resume() external {
        _checkAccessAllowed("resume()");
        require(isPaused == true, "PSM is not paused");
        isPaused = false;
        emit PSMResumed(msg.sender);
    }

    function setFeeIn(uint256 feeIn_) external {
        _checkAccessAllowed("setFeeIn(uint256)");
        // feeIn = 1000 = 100%
        require(feeIn < 1000, "Invalid fee");
        uint256 oldFeeIn = feeIn;
        feeIn = feeIn_;
        emit FeeInChanged(oldFeeIn, feeIn_);
    }

    function setFeeOut(uint256 feeOut_) external {
        _checkAccessAllowed("setFeeOut(uint256)");
        // feeOut = 1000 = 100%
        require(feeOut < 1000, "Invalid fee");
        uint256 oldFeeOut = feeOut;
        feeOut = feeOut_;
        emit FeeOutChanged(oldFeeOut, feeOut_);
    }

    function setVaiMintCap(uint256 vaiMintCap_) external {
        _checkAccessAllowed("setVaiMintCap(uint256)");
        uint256 oldVaiMintCap = vaiMintCap;
        vaiMintCap = vaiMintCap_;
        emit VaiMintCapChanged(oldVaiMintCap, vaiMintCap);
    }

    function setVenusTreasury(address venusTreasury_) external {
        _checkAccessAllowed("setVenusTreasury(address)");
        ensureNonzeroAddress(venusTreasury_);
        address oldTreasuryAddress = venusTreasury;
        venusTreasury = venusTreasury_;
        emit VenusTreasuryChanged(oldTreasuryAddress, venusTreasury_);
    }
}
