// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

interface VAI {
    function balanceOf(address usr) external returns (uint256);

    function transferFrom(address src, address dst, uint amount) external returns (bool);

    function mint(address usr, uint wad) external;

    function burn(address usr, uint wad) external;
}

interface DecimalProvider {
    function decimals() external view returns (uint8);
}

/**
 * @title Peg Stability Contract.
 * @notice Contract for swapping stable token for VAI token and vice versa to maintain the peg stability between them.
 * @author Venus Protocol
 */
contract PegStability is AccessControlledV8, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Helper enum for calculation of the fee.
    enum FeeDirection {
        IN,
        OUT
    }

    /// @notice The divisor used to convert fees to basis points.
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    /// @notice The mantissa value representing 1 (used for calculations).
    uint256 public constant MANTISSA_ONE = 1e18;

    /// @notice The value representing one dollar in the stable token.
    /// @dev Our oracle is returning amount depending on the number of decimals of the stable token. (36 - asset_decimals) E.g. 8 decimal asset = 1e28.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable ONE_DOLLAR;

    /// @notice The address of the VAI token contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable VAI_ADDRESS;

    /// @notice The address of the stable token contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable STABLE_TOKEN_ADDRESS;

    /// @notice The address of ResilientOracle contract wrapped in its interface.
    ResilientOracleInterface public oracle;

    /// @notice The address of the Venus Treasury contract.
    address public venusTreasury;

    /// @notice The incoming stableCoin fee. (Fee for swapStableForVAI).
    uint256 public feeIn;

    /// @notice The outgoing stableCoin fee. (Fee for swapVAIForStable).
    uint256 public feeOut;

    /// @notice The maximum amount of VAI that can be minted through this contract.
    uint256 public vaiMintCap;

    /// @notice The total amount of VAI minted through this contract.
    uint256 public vaiMinted;

    /// @notice A flag indicating whether the contract is currently paused or not.
    bool public isPaused;

    /// @notice Event emitted when contract is paused.
    event PSMPaused(address indexed admin);

    /// @notice Event emitted when the contract is resumed after pause.
    event PSMResumed(address indexed admin);

    /// @notice Event emitted when feeIn state var is modified.
    event FeeInChanged(uint256 oldFeeIn, uint256 newFeeIn);

    /// @notice Event emitted when feeOut state var is modified.
    event FeeOutChanged(uint256 oldFeeOut, uint256 newFeeOut);

    /// @notice Event emitted when vaiMintCap state var is modified.
    event VaiMintCapChanged(uint256 oldCap, uint256 newCap);

    /// @notice Event emitted when venusTreasury state var is modified.
    event VenusTreasuryChanged(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Event emitted when oracle state var is modified.
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    /// @notice Event emitted when stable token is swapped for VAI.
    event StableForVAISwapped(uint256 stableIn, uint256 vaiOut, uint256 fee);

    /// @notice Event emitted when stable token is swapped for VAI.
    event VaiForStableSwapped(uint256 vaiBurnt, uint256 vaiFee, uint256 stableOut);

    /**
     * @dev Prevents functions to execute when contract is paused.
     */
    modifier isActive() {
        require(!isPaused, "Contract is paused.");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address stableTokenAddress_, address vaiAddress_) {
        ensureNonzeroAddress(stableTokenAddress_);
        ensureNonzeroAddress(vaiAddress_);

        uint256 decimals_ = DecimalProvider(stableTokenAddress_).decimals();
        require(decimals_ <= 18, "too much decimals");
        ONE_DOLLAR = 10 ** (36 - decimals_); // 1$ scaled to the decimals returned by our Oracle
        STABLE_TOKEN_ADDRESS = stableTokenAddress_;
        VAI_ADDRESS = vaiAddress_;
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract via Proxy Contract with the required parameters.
     * @param accessControlManager_ The address of the AccessControlManager contract.
     * @param venusTreasury_ The address where fees will be sent.
     * @param oracleAddress_ The address of the ResilientOracle contract.
     * @param feeIn_ The percentage of fees to be applied to a stablecoin -> VAI swap.
     * @param feeOut_ The percentage of fees to be applied to a VAI -> stablecoin swap.
     * @param vaiMintCap_ The cap for the total amount of VAI that can be minted.
     */
    function initialize(
        address accessControlManager_,
        address venusTreasury_,
        address oracleAddress_,
        uint256 feeIn_,
        uint256 feeOut_,
        uint256 vaiMintCap_
    ) external initializer {
        ensureNonzeroAddress(accessControlManager_);
        ensureNonzeroAddress(venusTreasury_);
        ensureNonzeroAddress(oracleAddress_);
        __AccessControlled_init(accessControlManager_);
        __ReentrancyGuard_init();

        require(feeIn_ < BASIS_POINTS_DIVISOR, "Invalid fee in.");
        require(feeOut_ < BASIS_POINTS_DIVISOR, "Invalid fee out.");

        feeIn = feeIn_;
        feeOut = feeOut_;
        vaiMintCap = vaiMintCap_;
        venusTreasury = venusTreasury_;
        oracle = ResilientOracleInterface(oracleAddress_);
    }

    /*** Swap Functions ***/

    /**
     * @notice Swaps VAI for a stable token.
     * @param receiver The address where the stablecoin will be sent.
     * @param stableTknAmount The amount of stable tokens to receive.
     * @return The amount of VAI received and burnt from the sender.
     */
    // @custom:event Emits VaiForStableSwapped event.
    function swapVAIForStable(
        address receiver,
        uint256 stableTknAmount
    ) external isActive nonReentrant returns (uint256) {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero.");

        // update oracle price and calculate USD value of the stable token amount scaled in 18 decimals
        oracle.updateAssetPrice(STABLE_TOKEN_ADDRESS);
        uint256 stableTknAmountUSD = previewTokenUSDAmount(stableTknAmount, FeeDirection.OUT);
        uint256 fee = _calculateFee(stableTknAmountUSD, FeeDirection.OUT);

        require(VAI(VAI_ADDRESS).balanceOf(msg.sender) >= stableTknAmountUSD + fee, "Not enough VAI.");
        require(vaiMinted >= stableTknAmountUSD, "Can't burn more VAI than minted.");

        unchecked {
            vaiMinted -= stableTknAmountUSD;
        }

        if (fee != 0) {
            bool success = VAI(VAI_ADDRESS).transferFrom(msg.sender, venusTreasury, fee);
            require(success, "VAI fee transfer failed.");
        }

        VAI(VAI_ADDRESS).burn(msg.sender, stableTknAmountUSD);
        IERC20Upgradeable(STABLE_TOKEN_ADDRESS).safeTransfer(receiver, stableTknAmount);
        emit VaiForStableSwapped(stableTknAmountUSD, fee, stableTknAmount);
        return stableTknAmountUSD;
    }

    /**
     * @notice Swaps stable tokens for VAI with fees.
     * @dev This function adds support to fee-on-transfer tokens. The actualTransferAmt is calculated, by recording token balance state before and after the transfer.
     * @param receiver The address that will receive the VAI tokens.
     * @param stableTknAmount The amount of stable tokens to be swapped.
     * @return Amount of VAI minted to the sender.
     */
    // @custom:event Emits StableForVAISwapped event.
    function swapStableForVAI(
        address receiver,
        uint256 stableTknAmount
    ) external isActive nonReentrant returns (uint256) {
        ensureNonzeroAddress(receiver);
        require(stableTknAmount > 0, "Amount must be greater than zero.");

        // transfer IN, supporting fee-on-transfer tokens
        uint256 balanceBefore = IERC20Upgradeable(STABLE_TOKEN_ADDRESS).balanceOf(address(this));
        IERC20Upgradeable(STABLE_TOKEN_ADDRESS).safeTransferFrom(msg.sender, address(this), stableTknAmount);
        uint256 balanceAfter = IERC20Upgradeable(STABLE_TOKEN_ADDRESS).balanceOf(address(this));

        //calculate actual transfered amount (in case of fee-on-transfer tokens)
        uint256 actualTransferAmt = balanceAfter - balanceBefore;

        // update oracle price and calculate USD value of the stable token amount scaled in 18 decimals
        oracle.updateAssetPrice(STABLE_TOKEN_ADDRESS);
        uint256 actualTransferAmtInUSD = previewTokenUSDAmount(actualTransferAmt, FeeDirection.IN);

        //calculate feeIn
        uint256 fee = _calculateFee(actualTransferAmtInUSD, FeeDirection.IN);
        uint256 vaiToMint = actualTransferAmtInUSD - fee;

        require(vaiMinted + actualTransferAmtInUSD <= vaiMintCap, "VAI mint cap reached.");
        unchecked {
            vaiMinted += actualTransferAmtInUSD;
        }

        // mint VAI to receiver
        VAI(VAI_ADDRESS).mint(receiver, vaiToMint);

        // mint VAI fee to venus treasury
        if (fee != 0) {
            VAI(VAI_ADDRESS).mint(venusTreasury, fee);
        }

        emit StableForVAISwapped(actualTransferAmt, vaiToMint, fee);
        return vaiToMint;
    }

    /*** Admin Functions ***/

    /**
     * @notice Pause the PSM contract.
     * @dev Reverts if the contract is already paused.
     */
    // @custom:event Emits PSMPaused event.
    function pause() external {
        _checkAccessAllowed("pause()");
        require(!isPaused, "PSM is already paused.");
        isPaused = true;
        emit PSMPaused(msg.sender);
    }

    /**
     * @notice Resume the PSM contract.
     * @dev Reverts if the contract is not paused.
     */
    // @custom:event Emits PSMResumed event.
    function resume() external {
        _checkAccessAllowed("resume()");
        require(isPaused, "PSM is not paused.");
        isPaused = false;
        emit PSMResumed(msg.sender);
    }

    /**
     * @notice Set the fee percentage for incoming swaps.
     * @dev Reverts if the new fee percentage is invalid (greater than or equal to BASIS_POINTS_DIVISOR).
     * @param feeIn_ The new fee percentage for incoming swaps.
     */
    // @custom:event Emits FeeInChanged event.
    function setFeeIn(uint256 feeIn_) external {
        _checkAccessAllowed("setFeeIn(uint256)");
        // feeIn = 10000 = 100%
        require(feeIn_ < BASIS_POINTS_DIVISOR, "Invalid fee.");
        uint256 oldFeeIn = feeIn;
        feeIn = feeIn_;
        emit FeeInChanged(oldFeeIn, feeIn_);
    }

    /**
     * @notice Set the fee percentage for outgoing swaps.
     * @dev Reverts if the new fee percentage is invalid (greater than or equal to BASIS_POINTS_DIVISOR).
     * @param feeOut_ The new fee percentage for outgoing swaps.
     */
    // @custom:event Emits FeeOutChanged event.
    function setFeeOut(uint256 feeOut_) external {
        _checkAccessAllowed("setFeeOut(uint256)");
        // feeOut = 10000 = 100%
        require(feeOut_ < BASIS_POINTS_DIVISOR, "Invalid fee.");
        uint256 oldFeeOut = feeOut;
        feeOut = feeOut_;
        emit FeeOutChanged(oldFeeOut, feeOut_);
    }

    /**
     * @dev Set the maximum amount of VAI that can be minted through this contract.
     * @param vaiMintCap_ The new maximum amount of VAI that can be minted.
     */
    // @custom:event Emits VaiMintCapChanged event.
    function setVaiMintCap(uint256 vaiMintCap_) external {
        _checkAccessAllowed("setVaiMintCap(uint256)");
        uint256 oldVaiMintCap = vaiMintCap;
        vaiMintCap = vaiMintCap_;
        emit VaiMintCapChanged(oldVaiMintCap, vaiMintCap_);
    }

    /**
     * @notice Set the address of the Venus Treasury contract.
     * @dev Reverts if the new address is zero.
     * @param venusTreasury_ The new address of the Venus Treasury contract.
     */
    // @custom:event Emits VenusTreasuryChanged event.
    function setVenusTreasury(address venusTreasury_) external {
        _checkAccessAllowed("setVenusTreasury(address)");
        ensureNonzeroAddress(venusTreasury_);
        address oldTreasuryAddress = venusTreasury;
        venusTreasury = venusTreasury_;
        emit VenusTreasuryChanged(oldTreasuryAddress, venusTreasury_);
    }

    /**
     * @notice Set the address of the ResilientOracle contract.
     * @dev Reverts if the new address is zero.
     * @param oracleAddress_ The new address of the ResilientOracle contract.
     */
    // @custom:event Emits OracleChanged event.
    function setOracle(address oracleAddress_) external {
        _checkAccessAllowed("setOracle(address)");
        ensureNonzeroAddress(oracleAddress_);
        address oldOracleAddress = address(oracle);
        oracle = ResilientOracleInterface(oracleAddress_);
        emit OracleChanged(oldOracleAddress, oracleAddress_);
    }

    /*** Helper Functions ***/

    /**
     * @notice Calculates the amount of VAI that would be burnt from the user.
     * @dev This calculation might be off with a bit, if the price of the oracle for this asset is not updated in the block this function is invoked.
     * @param stableTknAmount The amount of stable tokens to be received after the swap.
     * @return The amount of VAI that would be taken from the user.
     */
    function previewSwapVAIForStable(uint256 stableTknAmount) external view returns (uint256) {
        require(stableTknAmount > 0, "Amount must be greater than zero.");

        uint256 stableTknAmountUSD = previewTokenUSDAmount(stableTknAmount, FeeDirection.OUT);
        uint256 fee = _calculateFee(stableTknAmountUSD, FeeDirection.OUT);

        require(vaiMinted >= stableTknAmountUSD, "Can't burn more VAI than minted.");

        return stableTknAmountUSD + fee;
    }

    /**
     * @notice Calculates the amount of VAI that would be sent to the receiver.
     * @dev This calculation might be off with a bit, if the price of the oracle for this asset is not updated in the block this function is invoked.
     * @param stableTknAmount The amount of stable tokens provided for the swap.
     * @return The amount of VAI that would be sent to the receiver.
     */
    function previewSwapStableForVAI(uint256 stableTknAmount) external view returns (uint256) {
        require(stableTknAmount > 0, "Amount must be greater than zero.");

        uint256 stableTknAmountUSD = previewTokenUSDAmount(stableTknAmount, FeeDirection.IN);

        //calculate feeIn
        uint256 fee = _calculateFee(stableTknAmountUSD, FeeDirection.IN);
        uint256 vaiToMint = stableTknAmountUSD - fee;

        require(vaiMinted + stableTknAmountUSD <= vaiMintCap, "VAI mint cap reached.");

        return vaiToMint;
    }

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
     * @notice Get the price of stable token in USD.
     * @dev This function returns either min(1$,oraclePrice) or max(1$,oraclePrice) with a decimal scale (36 - asset_decimals). E.g. for 8 decimal token 1$ will be 1e28.
     * @param direction The direction of the swap: FeeDirection.IN or FeeDirection.OUT.
     * @return The price in USD, adjusted based on the selected direction.
     */
    function getPriceInUSD(FeeDirection direction) internal view returns (uint256) {
        // get price with a scale = (36 - asset_decimals)
        uint256 price = oracle.getPrice(STABLE_TOKEN_ADDRESS);

        if (direction == FeeDirection.IN) {
            // MIN(1, price)
            return price < ONE_DOLLAR ? price : ONE_DOLLAR;
        } else {
            // MAX(1, price)
            return price > ONE_DOLLAR ? price : ONE_DOLLAR;
        }
    }

    /**
     * @notice Calculate the fee amount based on the input amount and fee percentage.
     * @dev Reverts if the fee percentage calculation results in rounding down to 0.
     * @param amount The input amount to calculate the fee from.
     * @param direction The direction of the fee: FeeDirection.IN or FeeDirection.OUT.
     * @return The fee amount.
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

    /**
     * @notice Checks that the address is not the zero address.
     * @param someone The address to check.
     */
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "Can't be zero address.");
    }
}
