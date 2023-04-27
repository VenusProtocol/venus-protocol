// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

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

interface IPriceOracle {
    function getUnderlyingPrice(address vToken) external view returns (uint256);
}

interface IVTokenUnderlying {
    function underlying() external view returns (address);
}

interface OracleProviderInterface {
    function oracle() external view returns (address);
}

/**
 * @title Peg Stability Contract
 * @notice Contract for swapping stable token for VAI token and vice versa to maintain the peg stability between them.
 * @author Venus Protocol
 */
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
    address public comptroller;
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

    /// @notice Event emitted when comptroller  state var is modified
    event ComptrollerChanged(address indexed oldComptroller, address indexed newComptroller);

    /// @notice Event emitted when stable token is swapped for VAI
    event StableForVAISwapped(uint256 stableIn, uint256 vaiOut, uint256 fee);

    /// @notice Event emitted when stable token is swapped for VAI
    event VaiForStableSwapped(uint256 vaiBurnt, uint256 vaiFee, uint256 stableOut);

    /**
     * @dev Prevents functions to execute when contract is paused.
     */
    modifier isActive() {
        require(!isPaused, "Contract is paused.");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address vTokenAddress_, address vaiAddress_) {
        ensureNonzeroAddress(vTokenAddress_);
        ensureNonzeroAddress(vaiAddress_);
        vTokenAddress = vTokenAddress_;
        stableTokenAddress = IVTokenUnderlying(vTokenAddress_).underlying();
        vaiAddress = vaiAddress_;
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract via Proxy Contract with the required parameters
     * @param accessControlManager_ The address of the AccessControlManager contract
     * @param venusTreasury_ The address where fees will be sent
     * @param comptroller_ The address of the Comptroller contract
     * @param feeIn_ The percentage of fees to be applied to a stablecoin -> VAI swap
     * @param feeOut_ The percentage of fees to be applied to a VAI -> stablecoin swap
     * @param vaiMintCap_ The cap for the total amount of VAI that can be minted
     */
    function initialize(
        address accessControlManager_,
        address venusTreasury_,
        address comptroller_,
        uint256 feeIn_,
        uint256 feeOut_,
        uint256 vaiMintCap_
    ) external initializer {
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(venusTreasury_);
        ensureNonzeroAddress(comptroller_);
        ensureNonzeroAddress(OracleProviderInterface(comptroller_).oracle());
        __AccessControlled_init(accessControlManager_);
        __ReentrancyGuard_init();
        require(feeIn_ < BASIS_POINTS_DIVISOR, "Invalid fee in.");
        require(feeOut_ < BASIS_POINTS_DIVISOR, "Invalid fee out.");
        feeIn = feeIn_;
        feeOut = feeOut_;
        vaiMintCap = vaiMintCap_;
        venusTreasury = venusTreasury_;
        comptroller = comptroller_;
    }

    /**
     * @notice Checks that the address is not the zero address
     * @param someone The address to check
     */
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "Can't be zero address.");
    }

    /*** Swap Functions ***/

    /**
     * @notice Swaps VAI for a stable token
     * @param receiver The address where the stablecoin will be sent
     * @param stableTknAmount The amount of stable tokens to receive
     */
    // @custom:event Emits VaiForStableSwapped event
    function swapVAIForStable(address receiver, uint256 stableTknAmount) external isActive nonReentrant {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero.");
        uint256 stableTknAmountUSD = previewTokenUSDAmount(stableTknAmount, FeeDirection.OUT);
        uint256 fee = _calculateFee(stableTknAmountUSD, FeeDirection.OUT);
        require(VAI(vaiAddress).balanceOf(msg.sender) >= stableTknAmountUSD + fee, "Not enough VAI.");
        require(vaiMinted >= stableTknAmountUSD, "Can't burn more VAI than minted.");
        if (fee != 0) {
            bool success = VAI(vaiAddress).transferFrom(msg.sender, venusTreasury, fee);
            require(success, "VAI fee transfer failed.");
        }
        unchecked {
            vaiMinted -= stableTknAmountUSD;
        }
        VAI(vaiAddress).burn(msg.sender, stableTknAmountUSD);
        IERC20Upgradeable(stableTokenAddress).safeTransfer(receiver, stableTknAmount);
        emit VaiForStableSwapped(stableTknAmountUSD, fee, stableTknAmount);
    }

    /**
     * @notice Swaps stable tokens for VAI with fees.
     * @param receiver The address that will receive the VAI tokens.
     * @param stableTknAmount The amount of stable tokens to be swapped.
     */
    // @custom:event Emits StableForVAISwapped event
    function swapStableForVAI(address receiver, uint256 stableTknAmount) external isActive nonReentrant {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero.");
        uint256 balanceBefore = IERC20Upgradeable(stableTokenAddress).balanceOf(address(this));
        IERC20Upgradeable(stableTokenAddress).safeTransferFrom(msg.sender, address(this), stableTknAmount);
        uint256 balanceAfter = IERC20Upgradeable(stableTokenAddress).balanceOf(address(this));
        uint256 actualTransferAmt = balanceAfter - balanceBefore;
        uint256 actualTransferAmtInUSD = previewTokenUSDAmount(actualTransferAmt, FeeDirection.IN);
        //calculate feeIn
        uint256 fee = _calculateFee(actualTransferAmtInUSD, FeeDirection.IN);
        uint256 vaiToMint = actualTransferAmtInUSD - fee;
        require(vaiMinted + actualTransferAmtInUSD <= vaiMintCap, "VAI mint cap reached.");
        unchecked {
            vaiMinted += actualTransferAmtInUSD;
        }
        // mint VAI to receiver
        VAI(vaiAddress).mint(receiver, vaiToMint);
        // mint VAI fee to venus treasury
        if (fee != 0) {
            VAI(vaiAddress).mint(venusTreasury, fee);
        }
        emit StableForVAISwapped(actualTransferAmt, vaiToMint, fee);
    }

    /*** Helper Functions ***/

    /**
     * @dev Calculates the USD value of the given amount of stable tokens depending on the swap direction.
     * @param amount The amount of stable tokens.
     * @param direction The direction of the swap.
     * @return The USD value of the given amount of stable tokens scaled by 1e18 taking into account the direction of the swap
     */
    function previewTokenUSDAmount(uint256 amount, FeeDirection direction) internal view returns (uint256) {
        return (amount * getPriceInUSD(direction)) / MANTISSA_ONE;
    }

    /**
     * @notice Get the price of stable token in USD, based on the selected oracle
     * @dev This function returns either min(1$,oraclePrice) or max(1$,oraclePrice) depending on the direction of the swap
     * @param direction The direction of the swap: FeeDirection.IN or FeeDirection.OUT
     * @return The price in USD, adjusted based on the selected direction
     */
    function getPriceInUSD(FeeDirection direction) internal view returns (uint256) {
        address priceOracleAddress = OracleProviderInterface(comptroller).oracle();
        uint256 price = IPriceOracle(priceOracleAddress).getUnderlyingPrice(vTokenAddress);
        require(price != INVALID_ORACLE_PRICE, "Invalid oracle price.");
        if (direction == FeeDirection.IN) {
            //MIN (1,price)
            return MANTISSA_ONE < price ? MANTISSA_ONE : price;
        } else {
            //MAX (1,price)
            return MANTISSA_ONE > price ? MANTISSA_ONE : price;
        }
    }

    /**
     * @notice Calculate the fee amount based on the input amount and fee percentage
     * @dev Reverts if the fee percentage calculation results in rounding down to 0
     * @param amount The input amount to calculate the fee from
     * @param direction The direction of the fee: FeeDirection.IN or FeeDirection.OUT
     * @return The fee amount
     */
    function _calculateFee(uint256 amount, FeeDirection direction) internal view returns (uint256) {
        uint256 feePercent;
        if (direction == FeeDirection.IN) {
            feePercent = feeIn;
        } else {
            feePercent = feeOut;
        }
        if (feePercent == 0) {
            return 0;
        } else {
            // checking if the percent calculation will result in rounding down to 0
            require(amount * feePercent >= BASIS_POINTS_DIVISOR, "Amount too small.");
            return (amount * feePercent) / BASIS_POINTS_DIVISOR;
        }
    }

    /*** Admin Functions ***/

    /**
     * @notice Pause the PSM contract
     * @dev Reverts if the contract is already paused
     */
    // @custom:event Emits PSMPaused event
    function pause() external {
        _checkAccessAllowed("pause()");
        require(!isPaused, "PSM is already paused.");
        isPaused = true;
        emit PSMPaused(msg.sender);
    }

    /**
     * @notice Resume the PSM contract
     * @dev Reverts if the contract is not paused
     */
    // @custom:event Emits PSMResumed event
    function resume() external {
        _checkAccessAllowed("resume()");
        require(isPaused, "PSM is not paused.");
        isPaused = false;
        emit PSMResumed(msg.sender);
    }

    /**
     * @notice Set the fee percentage for incoming swaps
     * @dev Reverts if the new fee percentage is invalid (greater than or equal to BASIS_POINTS_DIVISOR)
     * @param feeIn_ The new fee percentage for incoming swaps
     */
    // @custom:event Emits FeeInChanged event
    function setFeeIn(uint256 feeIn_) external {
        _checkAccessAllowed("setFeeIn(uint256)");
        // feeIn = 10000 = 100%
        require(feeIn_ < BASIS_POINTS_DIVISOR, "Invalid fee.");
        uint256 oldFeeIn = feeIn;
        feeIn = feeIn_;
        emit FeeInChanged(oldFeeIn, feeIn_);
    }

    /**
     * @notice Set the fee percentage for outgoing swaps
     * @dev Reverts if the new fee percentage is invalid (greater than or equal to BASIS_POINTS_DIVISOR)
     * @param feeOut_ The new fee percentage for outgoing swaps
     */
    // @custom:event Emits FeeOutChanged event
    function setFeeOut(uint256 feeOut_) external {
        _checkAccessAllowed("setFeeOut(uint256)");
        // feeOut = 10000 = 100%
        require(feeOut_ < BASIS_POINTS_DIVISOR, "Invalid fee.");
        uint256 oldFeeOut = feeOut;
        feeOut = feeOut_;
        emit FeeOutChanged(oldFeeOut, feeOut_);
    }

    /**
     * @dev Set the maximum amount of VAI that can be minted through this contract
     * @param vaiMintCap_ The new maximum amount of VAI that can be minted
     */
    // @custom:event Emits VaiMintCapChanged event
    function setVaiMintCap(uint256 vaiMintCap_) external {
        _checkAccessAllowed("setVaiMintCap(uint256)");
        uint256 oldVaiMintCap = vaiMintCap;
        vaiMintCap = vaiMintCap_;
        emit VaiMintCapChanged(oldVaiMintCap, vaiMintCap_);
    }

    /**
     * @notice Set the address of the Venus Treasury contract
     * @dev Reverts if the new address is zero
     * @param venusTreasury_ The new address of the Venus Treasury contract
     */
    // @custom:event Emits VenusTreasuryChanged event
    function setVenusTreasury(address venusTreasury_) external {
        _checkAccessAllowed("setVenusTreasury(address)");
        ensureNonzeroAddress(venusTreasury_);
        address oldTreasuryAddress = venusTreasury;
        venusTreasury = venusTreasury_;
        emit VenusTreasuryChanged(oldTreasuryAddress, venusTreasury_);
    }

    /**
     * @notice Set the address of the Comptroller contract from which we obtain the oracle address
     * @dev Reverts if the new address is zero or the oracle address returned from Comptroller is zero
     * @param comptroller_ The new address of the Comptroller contract
     */
    // @custom:event Emits ComptrollerChanged event
    function setComptroller(address comptroller_) external {
        _checkAccessAllowed("setComptroller(address)");
        ensureNonzeroAddress(comptroller_);
        ensureNonzeroAddress(OracleProviderInterface(comptroller_).oracle());
        address oldComptrollerAddress = comptroller;
        comptroller = comptroller_;
        emit ComptrollerChanged(oldComptrollerAddress, comptroller_);
    }
}
