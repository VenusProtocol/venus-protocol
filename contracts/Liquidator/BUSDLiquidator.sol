// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { MANTISSA_ONE } from "@venusprotocol/solidity-utilities/contracts/constants.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { approveOrRevert } from "../lib/approveOrRevert.sol";
import { ILiquidator, IComptroller, IVToken, IVBep20, IVBNB, IVAIController } from "../InterfacesV8.sol";

/**
 * @title BUSDLiquidator
 * @author Venus
 * @notice A custom contract for force-liquidating BUSD debts
 */
contract BUSDLiquidator is Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeERC20Upgradeable for IVToken;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVBep20 public immutable vBUSD;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IComptroller public immutable comptroller;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable treasury;

    /// @notice The liquidator's share, scaled by 1e18 (e.g. 1.02 * 1e18 for 102% of the debt covered)
    uint256 public liquidatorShareMantissa;

    /// @notice Thrown if trying to set liquidator's share lower than 100% of the debt covered
    error LiquidatorShareTooLow(uint256 liquidatorShareMantissa_);

    /// @notice Thrown if trying to set liquidator's share larger than this contract can receive from a liquidation
    error LiquidatorShareTooHigh(uint256 maxLiquidatorShareMantissa, uint256 liquidatorShareMantissa_);

    /// @notice Emitted when the liquidator's share is set
    event NewLiquidatorShare(uint256 oldLiquidatorShareMantissa, uint256 newLiquidatorShareMantissa);

    /// @notice Constructor for the implementation contract. Sets immutable variables.
    /// @param comptroller_ The address of the Comptroller contract
    /// @param vBUSD_ The address of the VBNB
    /// @param treasury_ The address of Venus treasury
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address comptroller_, address vBUSD_, address treasury_) {
        ensureNonzeroAddress(vBUSD_);
        ensureNonzeroAddress(comptroller_);
        ensureNonzeroAddress(treasury_);
        vBUSD = IVBep20(vBUSD_);
        comptroller = IComptroller(comptroller_);
        treasury = treasury_;
        _disableInitializers();
    }

    /// @notice Initializer for the implementation contract.
    /// @param liquidatorShareMantissa_ Liquidator's share, scaled by 1e18 (e.g. 1.01 * 1e18 for 101%)
    /// @custom:error LiquidatorShareTooHigh is thrown if trying to set liquidator percent larger than the liquidation profit
    function initialize(uint256 liquidatorShareMantissa_) external virtual initializer {
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        _validateLiquidatorShareMantissa(liquidatorShareMantissa_);
        liquidatorShareMantissa = liquidatorShareMantissa_;
    }

    /// @notice Liquidate the entire BUSD debt of a borrower, seizing vTokenCollateral
    /// @param borrower The borrower whose debt should be liquidated
    /// @param vTokenCollateral The collateral to seize from the borrower
    function liquidateEntireBorrow(address borrower, IVToken vTokenCollateral) external nonReentrant {
        uint256 repayAmount = vBUSD.borrowBalanceCurrent(borrower);
        _unpauseAndLiquidate(borrower, repayAmount, vTokenCollateral);
    }

    /// @notice Liquidate a BUSD borrow, repaying the repayAmount of BUSD
    /// @param borrower The borrower whose debt should be liquidated
    /// @param repayAmount The amount to repay
    /// @param vTokenCollateral The collateral to seize from the borrower
    function liquidateBorrow(address borrower, uint256 repayAmount, IVToken vTokenCollateral) external nonReentrant {
        _unpauseAndLiquidate(borrower, repayAmount, vTokenCollateral);
    }

    /// @notice Allows Governance to set the liquidator's share
    /// @param liquidatorShareMantissa_ Liquidator's share, scaled by 1e18 (e.g. 1.01 * 1e18 for 101%)
    /// @custom:access Only Governance
    function setLiquidatorShare(uint256 liquidatorShareMantissa_) external onlyOwner {
        _validateLiquidatorShareMantissa(liquidatorShareMantissa_);
        uint256 oldLiquidatorShareMantissa = liquidatorShareMantissa;
        liquidatorShareMantissa = liquidatorShareMantissa_;
        emit NewLiquidatorShare(oldLiquidatorShareMantissa, liquidatorShareMantissa_);
    }

    /// @notice Allows to recover token accidentally sent to this contract by sending the entire balance to Governance
    /// @param token The address of the token to recover
    /// @custom:access Only Governance
    function sweepToken(IERC20Upgradeable token) external onlyOwner {
        token.safeTransfer(msg.sender, token.balanceOf(address(this)));
    }

    /// @dev Unpauses the liquidation on the BUSD market, liquidates the borrower's debt,
    /// and pauses the liquidations back
    /// @param borrower The borrower whose debt should be liquidated
    /// @param repayAmount The amount to repay
    /// @param vTokenCollateral The collateral to seize from the borrower
    function _unpauseAndLiquidate(address borrower, uint256 repayAmount, IVToken vTokenCollateral) internal {
        address[] memory vTokens = new address[](1);
        vTokens[0] = address(vBUSD);
        IComptroller.Action[] memory actions = new IComptroller.Action[](1);
        actions[0] = IComptroller.Action.LIQUIDATE;

        comptroller._setActionsPaused(vTokens, actions, false);
        _liquidateBorrow(borrower, repayAmount, vTokenCollateral);
        comptroller._setActionsPaused(vTokens, actions, true);
    }

    /// @dev Performs the actual liquidation, transferring BUSD from the sender to this contract,
    /// repaying the debt, and transferring the seized collateral to the sender and the treasury
    /// @param borrower The borrower whose debt should be liquidated
    /// @param repayAmount The amount to repay
    /// @param vTokenCollateral The collateral to seize from the borrower
    function _liquidateBorrow(address borrower, uint256 repayAmount, IVToken vTokenCollateral) internal {
        ILiquidator liquidatorContract = ILiquidator(comptroller.liquidatorContract());
        IERC20Upgradeable busd = IERC20Upgradeable(vBUSD.underlying());

        uint256 actualRepayAmount = _transferIn(busd, msg.sender, repayAmount);
        approveOrRevert(busd, address(liquidatorContract), actualRepayAmount);
        uint256 balanceBefore = vTokenCollateral.balanceOf(address(this));
        liquidatorContract.liquidateBorrow(address(vBUSD), borrower, actualRepayAmount, vTokenCollateral);
        uint256 receivedAmount = vTokenCollateral.balanceOf(address(this)) - balanceBefore;
        approveOrRevert(busd, address(liquidatorContract), 0);

        (uint256 liquidatorAmount, uint256 treasuryAmount) = _computeShares(
            receivedAmount,
            borrower,
            address(vTokenCollateral)
        );
        vTokenCollateral.safeTransfer(msg.sender, liquidatorAmount);
        vTokenCollateral.safeTransfer(treasury, treasuryAmount);
    }

    /// @dev Transfers tokens to this contract and returns the actual transfer amount
    /// @param token The token to transfer
    /// @param from The account to transfer from
    /// @param amount The amount to transfer
    /// @return The actual amount transferred
    function _transferIn(IERC20Upgradeable token, address from, uint256 amount) internal returns (uint256) {
        uint256 prevBalance = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        return token.balanceOf(address(this)) - prevBalance;
    }

    /// @notice Computes the liquidator's and treasury's shares from the received liquidation amount
    /// @param receivedAmount The total amount received from liquidating the borrower's collateral
    /// @param borrower The account whose collateral was liquidated
    /// @param vTokenCollateral The vToken representing the collateral asset
    /// @return liquidatorAmount The portion of `receivedAmount` allocated to the liquidator
    /// @return treasuryAmount The portion of `receivedAmount` allocated to the treasury
    function _computeShares(
        uint256 receivedAmount,
        address borrower,
        address vTokenCollateral
    ) internal view returns (uint256 liquidatorAmount, uint256 treasuryAmount) {
        uint256 effectiveIncentive = _getEffectiveIncentive(borrower, vTokenCollateral);

        // The bonus portion only (extra incentive above 100%)
        uint256 bonusAmount = (receivedAmount * (effectiveIncentive - MANTISSA_ONE)) / effectiveIncentive;

        // Treasury takes a fixed % of the bonus
        uint256 treasuryPercentMantissa = MANTISSA_ONE - liquidatorShareMantissa;
        treasuryAmount = (bonusAmount * treasuryPercentMantissa) / MANTISSA_ONE;

        // Liquidator gets the rest
        liquidatorAmount = receivedAmount - treasuryAmount;
    }

    /// @notice Computes the effective liquidation incentive after accounting the Liquidatior Contract treasury share
    /// @param borrower The account whose collateral is being evaluated
    /// @param vTokenCollateral The vToken representing the collateral asset
    /// @return effectiveIncentiveMantissa The incentive after accounting the Liquidatior Contract treasury share
    function _getEffectiveIncentive(address borrower, address vTokenCollateral) internal view returns (uint256) {
        uint256 totalIncentive = comptroller.getDynamicLiquidationIncentive(borrower, vTokenCollateral);
        uint256 treasuryPercent = ILiquidator(comptroller.liquidatorContract()).treasuryPercentMantissa();

        // Bonus portion after subtracting treasury share
        uint256 adjustedBonus = ((totalIncentive - MANTISSA_ONE) * (MANTISSA_ONE - treasuryPercent)) / MANTISSA_ONE;

        // Return effective incentive
        return MANTISSA_ONE + adjustedBonus;
    }

    /// @notice Validates that the liquidator's share of the bonus is within acceptable bounds
    /// @dev `liquidatorShareMantissa_` represents the percentage of the bonus portion (extra above 100%).
    ///      For example, if the liquidation incentive is 1.1 (i.e., 10% bonus), `liquidatorShareMantissa_`
    ///      of 0.5e18 means the liquidator gets 50% of that 10% bonus.
    ///      Must not exceed 100% (1e18) of the bonus.
    /// @param liquidatorShareMantissa_ The liquidator's share of the bonus, scaled by 1e18
    function _validateLiquidatorShareMantissa(uint256 liquidatorShareMantissa_) internal view {
        if (liquidatorShareMantissa_ > MANTISSA_ONE) {
            revert LiquidatorShareTooHigh(MANTISSA_ONE, liquidatorShareMantissa_);
        }
    }
}
