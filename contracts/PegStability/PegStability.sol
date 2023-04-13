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

interface PriceOracle {
    function getUnderlyingPrice(address vToken) external view returns (uint256);
}

interface VToken {
    function underlying() external view returns (address);
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
    address public immutable vTokenAddress; // vToken having as underlying the stableToken
    address public priceOracle;
    address public venusTreasury;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000; // fee is in basis points
    uint256 public constant INVALID_ORACLE_PRICE = 0;
    uint256 public constant MANTISSA_ONE = 1e18;
    uint256 public feeIn; // incoming VAI fee
    uint256 public feeOut; // outgoing VAI fee
    uint256 public vaiMintCap; // max amount of VAI that can be minted through this contract
    uint256 public vaiMinted;
    bool public isPaused;

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
    event VenusTreasuryChanged(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Event emitted when priceOracle state var is modified
    event PriceOracleChanged(address indexed oldPriceOracle, address indexed newPriceOracle);

    /// @notice Event emitted when stable token is swapped for VAI
    event StableForVAISwapped(uint256 stableIn, uint256 vaiOut, uint256 fee);

    /// @notice Event emitted when stable token is swapped for VAI
    event VaiForStableSwapped(uint256 vaiBurnt, uint256 vaiFee, uint256 stableOut);

    /**
     * @dev Prevents functions to execute when contract is paused.
     */
    modifier isActive() {
        require(isPaused == false, "Contract is paused");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address vTokenAddress_, address vaiAddress_) {
        ensureNonzeroAddress(vTokenAddress_);
        ensureNonzeroAddress(vaiAddress_);
        vTokenAddress = vTokenAddress_;
        stableTokenAddress = VToken(vTokenAddress).underlying();
        vaiAddress = vaiAddress_;
        _disableInitializers();
    }

    function initialize(
        address accessControlManager_,
        address venusTreasury_,
        address priceOracle_,
        uint256 feeIn_,
        uint256 feeOut_,
        uint256 vaiMintCap_
    ) external initializer {
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(venusTreasury_);
        ensureNonzeroAddress(priceOracle_);
        __AccessControlled_init(accessControlManager_);
        feeIn = feeIn_;
        feeOut = feeOut_;
        vaiMintCap = vaiMintCap_;
        venusTreasury = venusTreasury_;
        priceOracle = priceOracle_;
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "can't be zero address");
    }

    /*** Swap Functions ***/

    function swapVAIForStable(address receiver, uint256 stableTknAmount) external isActive nonReentrant {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero");
        uint256 stableTknAmountUSD = previewTokenUSDAmount(stableTknAmount, FeeDirection.OUT);
        uint256 fee = _calculateFee(stableTknAmountUSD, FeeDirection.OUT);
        require(VAI(vaiAddress).balanceOf(msg.sender) >= stableTknAmountUSD + fee, "not enought VAI");
        bool success = VAI(vaiAddress).transferFrom(msg.sender, venusTreasury, fee);
        require(success, "VAI fee transfer failed");
        if (vaiMinted != 0) {
            vaiMinted -= stableTknAmountUSD;
        }
        VAI(vaiAddress).burn(msg.sender, stableTknAmountUSD);
        IERC20Upgradeable(stableTokenAddress).safeTransferFrom(address(this), receiver, stableTknAmountUSD);
        emit VaiForStableSwapped(stableTknAmountUSD, fee, stableTknAmountUSD);
    }

    function swapStableForVAI(address receiver, uint256 stableTknAmount) external isActive nonReentrant {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero");
        uint256 balanceBefore = IERC20Upgradeable(stableTokenAddress).balanceOf(address(this));
        IERC20Upgradeable(stableTokenAddress).safeTransferFrom(msg.sender, address(this), stableTknAmount);
        uint256 balanceAfter = IERC20Upgradeable(stableTokenAddress).balanceOf(address(this));
        uint256 actualTransferAmt = balanceAfter - balanceBefore;
        uint256 actualTransferAmtInUSD = previewTokenUSDAmount(actualTransferAmt, FeeDirection.IN);
        //calculate feeIn
        uint256 fee = _calculateFee(actualTransferAmtInUSD, FeeDirection.IN);
        uint256 vaiToMint = actualTransferAmtInUSD - fee;
        require(vaiMinted + actualTransferAmtInUSD <= vaiMintCap, "VAI mint cap reached");
        vaiMinted += actualTransferAmtInUSD;
        // mint VAI to receiver
        VAI(vaiAddress).mint(receiver, vaiToMint);
        // mint VAI fee to venus treasury
        VAI(vaiAddress).mint(venusTreasury, fee);
        emit StableForVAISwapped(actualTransferAmtInUSD, vaiToMint, fee);
    }

    /*** Helper Functions ***/

    // returns the USD value of the given amount of stable tokens scaled by 1e18 depending on the position of the swap
    function previewTokenUSDAmount(uint256 amount, FeeDirection direction) internal view returns (uint256) {
        return (amount * getPriceInUSD(direction)) / MANTISSA_ONE;
    }

    // returns the price in USD for 1 token, having in mind the direction of the swap scaled by 1e18
    function getPriceInUSD(FeeDirection direction) internal view returns (uint256) {
        uint256 price = PriceOracle(priceOracle).getUnderlyingPrice(vTokenAddress);
        require(price != INVALID_ORACLE_PRICE, "Invalid oracle price");
        if (direction == FeeDirection.IN) {
            //MIN (1,price)
            return MANTISSA_ONE < price ? MANTISSA_ONE : price;
        } else {
            //MAX (1,price)
            return MANTISSA_ONE > price ? MANTISSA_ONE : price;
        }
    }

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
        // feeIn = 10000 = 100%
        require(feeIn_ < BASIS_POINTS_DIVISOR, "Invalid fee");
        uint256 oldFeeIn = feeIn;
        feeIn = feeIn_;
        emit FeeInChanged(oldFeeIn, feeIn_);
    }

    function setFeeOut(uint256 feeOut_) external {
        _checkAccessAllowed("setFeeOut(uint256)");
        // feeOut = 10000 = 100%
        require(feeOut_ < BASIS_POINTS_DIVISOR, "Invalid fee");
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

    function setPriceOracle(address priceOracle_) external {
        _checkAccessAllowed("setPriceOracle(address)");
        ensureNonzeroAddress(priceOracle_);
        address oldPriceOracleAddress = priceOracle_;
        priceOracle = priceOracle_;
        emit VenusTreasuryChanged(oldPriceOracleAddress, priceOracle_);
    }
}
