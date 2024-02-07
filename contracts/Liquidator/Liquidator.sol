// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "./LiquidatorStorage.sol";
import { IComptroller, IVToken, IVBep20, IVBNB, IVAIController, IProtocolShareReserve, IWBNB } from "../InterfacesV8.sol";

contract Liquidator is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable, LiquidatorStorage, AccessControlledV8 {
    /// @notice Address of vBNB contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVBNB public immutable vBnb;

    /// @notice Address of Venus Unitroller contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IComptroller public immutable comptroller;

    /// @notice Address of VAIUnitroller contract.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVAIController public immutable vaiController;

    /// @notice Address of wBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable wBNB;

    /// @dev A unit (literal one) in EXP_SCALE, usually used in additions/subtractions
    uint256 internal constant MANTISSA_ONE = 1e18;

    /* Events */

    /// @notice Emitted when the percent of the seized amount that goes to treasury changes.
    event NewLiquidationTreasuryPercent(uint256 oldPercent, uint256 newPercent);

    /// @notice Emitted when a borrow is liquidated
    event LiquidateBorrowedTokens(
        address indexed liquidator,
        address indexed borrower,
        uint256 repayAmount,
        address vTokenBorrowed,
        address indexed vTokenCollateral,
        uint256 seizeTokensForTreasury,
        uint256 seizeTokensForLiquidator
    );

    /// @notice Emitted when the liquidation is restricted for a borrower
    event LiquidationRestricted(address indexed borrower);

    /// @notice Emitted when the liquidation restrictions are removed for a borrower
    event LiquidationRestrictionsDisabled(address indexed borrower);

    /// @notice Emitted when a liquidator is added to the allowedLiquidatorsByAccount mapping
    event AllowlistEntryAdded(address indexed borrower, address indexed liquidator);

    /// @notice Emitted when a liquidator is removed from the allowedLiquidatorsByAccount mapping
    event AllowlistEntryRemoved(address indexed borrower, address indexed liquidator);

    /// @notice Emitted when the amount of minLiquidatableVAI is updated
    event NewMinLiquidatableVAI(uint256 oldMinLiquidatableVAI, uint256 newMinLiquidatableVAI);

    /// @notice Emitted when the length of chunk gets updated
    event NewPendingRedeemChunkLength(uint256 oldPendingRedeemChunkLength, uint256 newPendingRedeemChunkLength);

    /// @notice Emitted when force liquidation is paused
    event ForceVAILiquidationPaused(address indexed sender);

    /// @notice Emitted when force liquidation is resumed
    event ForceVAILiquidationResumed(address indexed sender);

    /// @notice Emitted when new address of protocol share reserve is set
    event NewProtocolShareReserve(address indexed oldProtocolShareReserve, address indexed newProtocolShareReserves);

    /// @notice Emitted when reserves are reduced from liquidator contract to protocol share reserves
    event ProtocolLiquidationIncentiveTransferred(address indexed sender, address indexed token, uint256 reducedAmount);

    /* Errors */

    /// @notice Thrown if the liquidation is restricted and the liquidator is not in the allowedLiquidatorsByAccount mapping
    error LiquidationNotAllowed(address borrower, address liquidator);

    /// @notice Thrown if VToken transfer fails after the liquidation
    error VTokenTransferFailed(address from, address to, uint256 amount);

    /// @notice Thrown if the liquidation is not successful (the error code is from TokenErrorReporter)
    error LiquidationFailed(uint256 errorCode);

    /// @notice Thrown if trying to restrict liquidations for an already restricted borrower
    error AlreadyRestricted(address borrower);

    /// @notice Thrown if trying to unrestrict liquidations for a borrower that is not restricted
    error NoRestrictionsExist(address borrower);

    /// @notice Thrown if the liquidator is already in the allowedLiquidatorsByAccount mapping
    error AlreadyAllowed(address borrower, address liquidator);

    /// @notice Thrown if trying to remove a liquidator that is not in the allowedLiquidatorsByAccount mapping
    error AllowlistEntryNotFound(address borrower, address liquidator);

    /// @notice Thrown if BNB amount sent with the transaction doesn't correspond to the
    ///         intended BNB repayment
    error WrongTransactionAmount(uint256 expected, uint256 actual);

    /// @notice Thrown if trying to set treasury percent larger than the liquidation profit
    error TreasuryPercentTooHigh(uint256 maxTreasuryPercentMantissa, uint256 treasuryPercentMantissa_);

    /// @notice Thrown if trying to liquidate any token when VAI debt is too high
    error VAIDebtTooHigh(uint256 vaiDebt, uint256 minLiquidatableVAI);

    /// @notice Thrown when vToken is not listed
    error MarketNotListed(address vToken);

    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Constructor for the implementation contract. Sets immutable variables.
    /// @param comptroller_ The address of the Comptroller contract
    /// @param vBnb_ The address of the VBNB
    /// @param wBNB_ The address of wBNB
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address comptroller_, address payable vBnb_, address wBNB_) {
        ensureNonzeroAddress(vBnb_);
        ensureNonzeroAddress(comptroller_);
        ensureNonzeroAddress(wBNB_);
        vBnb = IVBNB(vBnb_);
        wBNB = wBNB_;
        comptroller = IComptroller(comptroller_);
        vaiController = IVAIController(IComptroller(comptroller_).vaiController());
        _disableInitializers();
    }

    receive() external payable {}

    /// @notice Initializer for the implementation contract.
    /// @param treasuryPercentMantissa_ Treasury share, scaled by 1e18 (e.g. 0.2 * 1e18 for 20%)
    /// @param accessControlManager_ address of access control manager
    /// @param protocolShareReserve_ The address of the protocol share reserve contract
    function initialize(
        uint256 treasuryPercentMantissa_,
        address accessControlManager_,
        address protocolShareReserve_
    ) external virtual reinitializer(2) {
        __Liquidator_init(treasuryPercentMantissa_, accessControlManager_, protocolShareReserve_);
    }

    /// @dev Liquidator initializer for derived contracts.
    /// @param treasuryPercentMantissa_ Treasury share, scaled by 1e18 (e.g. 0.2 * 1e18 for 20%)
    /// @param accessControlManager_ address of access control manager
    /// @param protocolShareReserve_ The address of the protocol share reserve contract
    function __Liquidator_init(
        uint256 treasuryPercentMantissa_,
        address accessControlManager_,
        address protocolShareReserve_
    ) internal onlyInitializing {
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        __Liquidator_init_unchained(treasuryPercentMantissa_, protocolShareReserve_);
        __AccessControlled_init_unchained(accessControlManager_);
    }

    /// @dev Liquidator initializer for derived contracts that doesn't call parent initializers.
    /// @param treasuryPercentMantissa_ Treasury share, scaled by 1e18 (e.g. 0.2 * 1e18 for 20%)
    /// @param protocolShareReserve_ The address of the protocol share reserve contract
    function __Liquidator_init_unchained(
        uint256 treasuryPercentMantissa_,
        address protocolShareReserve_
    ) internal onlyInitializing {
        validateTreasuryPercentMantissa(treasuryPercentMantissa_);
        treasuryPercentMantissa = treasuryPercentMantissa_;
        _setProtocolShareReserve(protocolShareReserve_);
    }

    /// @notice An admin function to restrict liquidations to allowed addresses only.
    /// @dev Use {addTo,removeFrom}AllowList to configure the allowed addresses.
    /// @param borrower The address of the borrower
    function restrictLiquidation(address borrower) external {
        _checkAccessAllowed("restrictLiquidation(address)");
        if (liquidationRestricted[borrower]) {
            revert AlreadyRestricted(borrower);
        }
        liquidationRestricted[borrower] = true;
        emit LiquidationRestricted(borrower);
    }

    /// @notice An admin function to remove restrictions for liquidations.
    /// @dev Does not impact the allowedLiquidatorsByAccount mapping for the borrower, just turns off the check.
    /// @param borrower The address of the borrower
    function unrestrictLiquidation(address borrower) external {
        _checkAccessAllowed("unrestrictLiquidation(address)");
        if (!liquidationRestricted[borrower]) {
            revert NoRestrictionsExist(borrower);
        }
        liquidationRestricted[borrower] = false;
        emit LiquidationRestrictionsDisabled(borrower);
    }

    /// @notice An admin function to add the liquidator to the allowedLiquidatorsByAccount mapping for a certain
    ///         borrower. If the liquidations are restricted, only liquidators from the
    ///         allowedLiquidatorsByAccount mapping can participate in liquidating the positions of this borrower.
    /// @param borrower The address of the borrower
    /// @param borrower The address of the liquidator
    function addToAllowlist(address borrower, address liquidator) external {
        _checkAccessAllowed("addToAllowlist(address,address)");
        if (allowedLiquidatorsByAccount[borrower][liquidator]) {
            revert AlreadyAllowed(borrower, liquidator);
        }
        allowedLiquidatorsByAccount[borrower][liquidator] = true;
        emit AllowlistEntryAdded(borrower, liquidator);
    }

    /// @notice An admin function to remove the liquidator from the allowedLiquidatorsByAccount mapping of a certain
    ///         borrower. If the liquidations are restricted, this liquidator will not be
    ///         able to liquidate the positions of this borrower.
    /// @param borrower The address of the borrower
    /// @param borrower The address of the liquidator
    function removeFromAllowlist(address borrower, address liquidator) external {
        _checkAccessAllowed("removeFromAllowlist(address,address)");
        if (!allowedLiquidatorsByAccount[borrower][liquidator]) {
            revert AllowlistEntryNotFound(borrower, liquidator);
        }
        allowedLiquidatorsByAccount[borrower][liquidator] = false;
        emit AllowlistEntryRemoved(borrower, liquidator);
    }

    /// @notice Liquidates a borrow and splits the seized amount between protocol share reserve and
    ///         liquidator. The liquidators should use this interface instead of calling
    ///         vToken.liquidateBorrow(...) directly.
    /// @notice Checks force VAI liquidation first; vToken should be address of vaiController if vaiDebt is greater than threshold
    /// @notice For BNB borrows msg.value should be equal to repayAmount; otherwise msg.value
    ///      should be zero.
    /// @param vToken Borrowed vToken
    /// @param borrower The address of the borrower
    /// @param repayAmount The amount to repay on behalf of the borrower
    /// @param vTokenCollateral The collateral to seize
    function liquidateBorrow(
        address vToken,
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    ) external payable nonReentrant {
        ensureNonzeroAddress(borrower);
        checkRestrictions(borrower, msg.sender);
        (bool isListed, , ) = IComptroller(comptroller).markets(address(vTokenCollateral));
        if (!isListed) {
            revert MarketNotListed(address(vTokenCollateral));
        }

        _checkForceVAILiquidate(vToken, borrower);
        uint256 ourBalanceBefore = vTokenCollateral.balanceOf(address(this));
        if (vToken == address(vBnb)) {
            if (repayAmount != msg.value) {
                revert WrongTransactionAmount(repayAmount, msg.value);
            }
            vBnb.liquidateBorrow{ value: msg.value }(borrower, vTokenCollateral);
        } else {
            if (msg.value != 0) {
                revert WrongTransactionAmount(0, msg.value);
            }
            if (vToken == address(vaiController)) {
                _liquidateVAI(borrower, repayAmount, vTokenCollateral);
            } else {
                _liquidateBep20(IVBep20(vToken), borrower, repayAmount, vTokenCollateral);
            }
        }
        uint256 ourBalanceAfter = vTokenCollateral.balanceOf(address(this));
        uint256 seizedAmount = ourBalanceAfter - ourBalanceBefore;
        (uint256 ours, uint256 theirs) = _distributeLiquidationIncentive(vTokenCollateral, seizedAmount);
        _reduceReservesInternal();
        emit LiquidateBorrowedTokens(
            msg.sender,
            borrower,
            repayAmount,
            vToken,
            address(vTokenCollateral),
            ours,
            theirs
        );
    }

    /// @notice Sets the new percent of the seized amount that goes to treasury. Should
    ///         be less than or equal to comptroller.liquidationIncentiveMantissa().sub(1e18).
    /// @param newTreasuryPercentMantissa New treasury percent (scaled by 10^18).
    function setTreasuryPercent(uint256 newTreasuryPercentMantissa) external {
        _checkAccessAllowed("setTreasuryPercent(uint256)");
        validateTreasuryPercentMantissa(newTreasuryPercentMantissa);
        emit NewLiquidationTreasuryPercent(treasuryPercentMantissa, newTreasuryPercentMantissa);
        treasuryPercentMantissa = newTreasuryPercentMantissa;
    }

    /**
     * @notice Sets protocol share reserve contract address
     * @param protocolShareReserve_ The address of the protocol share reserve contract
     */
    function setProtocolShareReserve(address payable protocolShareReserve_) external onlyOwner {
        _setProtocolShareReserve(protocolShareReserve_);
    }

    /**
     * @notice Reduce the reserves of the pending accumulated reserves
     */
    function reduceReserves() external nonReentrant {
        _reduceReservesInternal();
    }

    function _reduceReservesInternal() internal {
        uint256 _pendingRedeemLength = pendingRedeem.length;
        uint256 range = _pendingRedeemLength >= pendingRedeemChunkLength
            ? pendingRedeemChunkLength
            : _pendingRedeemLength;
        for (uint256 index = range; index > 0; ) {
            address vToken = pendingRedeem[index - 1];
            uint256 vTokenBalance_ = IVToken(vToken).balanceOf(address(this));
            if (_redeemUnderlying(vToken, vTokenBalance_)) {
                if (vToken == address(vBnb)) {
                    _reduceBnbReserves();
                } else {
                    _reduceVTokenReserves(vToken);
                }
                pendingRedeem[index - 1] = pendingRedeem[pendingRedeem.length - 1];
                pendingRedeem.pop();
            }
            unchecked {
                index--;
            }
        }
    }

    /// @dev Transfers BEP20 tokens to self, then approves vToken to take these tokens.
    function _liquidateBep20(IVBep20 vToken, address borrower, uint256 repayAmount, IVToken vTokenCollateral) internal {
        (bool isListed, , ) = IComptroller(comptroller).markets(address(vToken));
        if (!isListed) {
            revert MarketNotListed(address(vToken));
        }

        IERC20Upgradeable borrowedToken = IERC20Upgradeable(vToken.underlying());
        uint256 actualRepayAmount = _transferBep20(borrowedToken, msg.sender, address(this), repayAmount);
        borrowedToken.safeApprove(address(vToken), 0);
        borrowedToken.safeApprove(address(vToken), actualRepayAmount);
        requireNoError(vToken.liquidateBorrow(borrower, actualRepayAmount, vTokenCollateral));
    }

    /// @dev Transfers BEP20 tokens to self, then approves VAI to take these tokens.
    function _liquidateVAI(address borrower, uint256 repayAmount, IVToken vTokenCollateral) internal {
        IERC20Upgradeable vai = IERC20Upgradeable(vaiController.getVAIAddress());
        vai.safeTransferFrom(msg.sender, address(this), repayAmount);
        vai.safeApprove(address(vaiController), 0);
        vai.safeApprove(address(vaiController), repayAmount);

        (uint256 err, ) = vaiController.liquidateVAI(borrower, repayAmount, vTokenCollateral);
        requireNoError(err);
    }

    /// @dev Distribute seized collateral between liquidator and protocol share reserve
    function _distributeLiquidationIncentive(
        IVToken vTokenCollateral,
        uint256 seizedAmount
    ) internal returns (uint256 ours, uint256 theirs) {
        (ours, theirs) = _splitLiquidationIncentive(seizedAmount);
        if (!vTokenCollateral.transfer(msg.sender, theirs)) {
            revert VTokenTransferFailed(address(this), msg.sender, theirs);
        }

        if (ours > 0 && !_redeemUnderlying(address(vTokenCollateral), ours)) {
            // Check if asset is already present in pendingRedeem array
            uint256 index;
            for (index; index < pendingRedeem.length; ) {
                if (pendingRedeem[index] == address(vTokenCollateral)) {
                    break;
                }
                unchecked {
                    index++;
                }
            }
            if (index == pendingRedeem.length) {
                pendingRedeem.push(address(vTokenCollateral));
            }
        } else {
            if (address(vTokenCollateral) == address(vBnb)) {
                _reduceBnbReserves();
            } else {
                _reduceVTokenReserves(address(vTokenCollateral));
            }
        }
    }

    /// @dev Wraps BNB to wBNB and sends to protocol share reserve
    function _reduceBnbReserves() private {
        uint256 bnbBalance = address(this).balance;
        IWBNB(wBNB).deposit{ value: bnbBalance }();
        IERC20Upgradeable(wBNB).safeTransfer(protocolShareReserve, bnbBalance);
        IProtocolShareReserve(protocolShareReserve).updateAssetsState(
            address(comptroller),
            wBNB,
            IProtocolShareReserve.IncomeType.LIQUIDATION
        );
        emit ProtocolLiquidationIncentiveTransferred(msg.sender, wBNB, bnbBalance);
    }

    /// @dev Redeem seized collateral to underlying assets
    function _redeemUnderlying(address vToken, uint256 amount) private returns (bool) {
        try IVToken(address(vToken)).redeem(amount) returns (uint256 response) {
            if (response == 0) {
                return true;
            } else {
                return false;
            }
        } catch {
            return false;
        }
    }

    /// @dev Transfers seized collateral other than BNB to protocol share reserve
    function _reduceVTokenReserves(address vToken) private {
        address underlying = IVBep20(vToken).underlying();
        uint256 underlyingBalance = IERC20Upgradeable(underlying).balanceOf(address(this));
        IERC20Upgradeable(underlying).safeTransfer(protocolShareReserve, underlyingBalance);
        IProtocolShareReserve(protocolShareReserve).updateAssetsState(
            address(comptroller),
            underlying,
            IProtocolShareReserve.IncomeType.LIQUIDATION
        );
        emit ProtocolLiquidationIncentiveTransferred(msg.sender, underlying, underlyingBalance);
    }

    /// @dev Transfers tokens and returns the actual transfer amount
    function _transferBep20(
        IERC20Upgradeable token,
        address from,
        address to,
        uint256 amount
    ) internal returns (uint256) {
        uint256 prevBalance = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        return token.balanceOf(to) - prevBalance;
    }

    /// @dev Computes the amounts that would go to treasury and to the liquidator.
    function _splitLiquidationIncentive(uint256 seizedAmount) internal view returns (uint256 ours, uint256 theirs) {
        uint256 totalIncentive = comptroller.liquidationIncentiveMantissa();
        ours = (seizedAmount * treasuryPercentMantissa) / totalIncentive;
        theirs = seizedAmount - ours;
    }

    function requireNoError(uint256 errCode) internal pure {
        if (errCode == uint256(0)) {
            return;
        }

        revert LiquidationFailed(errCode);
    }

    function checkRestrictions(address borrower, address liquidator) internal view {
        if (liquidationRestricted[borrower] && !allowedLiquidatorsByAccount[borrower][liquidator]) {
            revert LiquidationNotAllowed(borrower, liquidator);
        }
    }

    function validateTreasuryPercentMantissa(uint256 treasuryPercentMantissa_) internal view {
        uint256 maxTreasuryPercentMantissa = comptroller.liquidationIncentiveMantissa() - MANTISSA_ONE;
        if (treasuryPercentMantissa_ > maxTreasuryPercentMantissa) {
            revert TreasuryPercentTooHigh(maxTreasuryPercentMantissa, treasuryPercentMantissa_);
        }
    }

    /// @dev Checks liquidation action in comptroller and vaiDebt with minLiquidatableVAI threshold
    function _checkForceVAILiquidate(address vToken_, address borrower_) private view {
        uint256 _vaiDebt = vaiController.getVAIRepayAmount(borrower_);
        bool _isVAILiquidationPaused = comptroller.actionPaused(address(vaiController), IComptroller.Action.LIQUIDATE);
        bool _isForcedLiquidationEnabled = comptroller.isForcedLiquidationEnabled(vToken_);
        if (
            _isForcedLiquidationEnabled ||
            _isVAILiquidationPaused ||
            !forceVAILiquidate ||
            _vaiDebt < minLiquidatableVAI ||
            vToken_ == address(vaiController)
        ) return;
        revert VAIDebtTooHigh(_vaiDebt, minLiquidatableVAI);
    }

    function _setProtocolShareReserve(address protocolShareReserve_) internal {
        ensureNonzeroAddress(protocolShareReserve_);
        emit NewProtocolShareReserve(protocolShareReserve, protocolShareReserve_);
        protocolShareReserve = protocolShareReserve_;
    }

    /**
     * @notice Sets the threshold for minimum amount of vaiLiquidate
     * @param minLiquidatableVAI_ New address for the access control
     */
    function setMinLiquidatableVAI(uint256 minLiquidatableVAI_) external {
        _checkAccessAllowed("setMinLiquidatableVAI(uint256)");
        emit NewMinLiquidatableVAI(minLiquidatableVAI, minLiquidatableVAI_);
        minLiquidatableVAI = minLiquidatableVAI_;
    }

    /**
     * @notice Length of the pendingRedeem array to be consider while redeeming in Liquidation transaction
     * @param newLength_ Length of the chunk
     */
    function setPendingRedeemChunkLength(uint256 newLength_) external {
        _checkAccessAllowed("setPendingRedeemChunkLength(uint256)");
        require(newLength_ > 0, "Invalid chunk size");
        emit NewPendingRedeemChunkLength(pendingRedeemChunkLength, newLength_);
        pendingRedeemChunkLength = newLength_;
    }

    /**
     * @notice Pause Force Liquidation of VAI
     */
    function pauseForceVAILiquidate() external {
        _checkAccessAllowed("pauseForceVAILiquidate()");
        require(forceVAILiquidate, "Force Liquidation of VAI is already Paused");
        forceVAILiquidate = false;
        emit ForceVAILiquidationPaused(msg.sender);
    }

    /**
     * @notice Resume Force Liquidation of VAI
     */
    function resumeForceVAILiquidate() external {
        _checkAccessAllowed("resumeForceVAILiquidate()");
        require(!forceVAILiquidate, "Force Liquidation of VAI is already resumed");
        forceVAILiquidate = true;
        emit ForceVAILiquidationResumed(msg.sender);
    }

    function renounceOwnership() public override {}
}
