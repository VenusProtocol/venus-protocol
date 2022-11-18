// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Utils/ReentrancyGuard.sol";
import "./Utils/WithAdmin.sol";

interface IComptroller {
    function liquidationIncentiveMantissa() external view returns (uint256);
}

interface IVToken is IERC20 {}

interface IVBep20 is IVToken {
    function underlying() external view returns (address);
    function liquidateBorrow(address borrower, uint256 repayAmount, IVToken vTokenCollateral)
        external
        returns (uint256);
}

interface IVBNB is IVToken {
    function liquidateBorrow(address borrower, IVToken vTokenCollateral) external payable;
}

interface IVAIController {
    function liquidateVAI(address borrower, uint256 repayAmount, IVToken vTokenCollateral)
        external
        returns (uint256, uint256);
    function getVAIAddress() external view returns (address);
}

contract Liquidator is WithAdmin, ReentrancyGuard {

    /// @notice Address of vBNB contract.
    IVBNB public vBnb;

    /// @notice Address of Venus Unitroller contract.
    IComptroller comptroller;

    /// @notice Address of VAIUnitroller contract.
    IVAIController vaiController;

    /// @notice Address of Venus Treasury.
    address public treasury;

    /// @notice Percent of seized amount that goes to treasury.
    uint256 public treasuryPercentMantissa;

    /// @notice Emitted when once changes the percent of the seized amount
    ///         that goes to treasury.
    event NewLiquidationTreasuryPercent(uint256 oldPercent, uint256 newPercent);

    /// @notice Event emitted when a borrow is liquidated
    event LiquidateBorrowedTokens(
        address indexed liquidator,
        address indexed borrower,
        uint256 repayAmount,
        address indexed vTokenCollateral,
        uint256 seizeTokensForTreasury,
        uint256 seizeTokensForLiquidator
    );

    using SafeERC20 for IERC20;

    constructor(
        address admin_,
        address payable vBnb_,
        address comptroller_,
        address vaiController_,
        address treasury_,
        uint256 treasuryPercentMantissa_
    )
        WithAdmin(admin_)
        ReentrancyGuard()
    {
        ensureNonzeroAddress(admin_);
        ensureNonzeroAddress(vBnb_);
        ensureNonzeroAddress(comptroller_);
        ensureNonzeroAddress(vaiController_);
        ensureNonzeroAddress(treasury_);
        vBnb = IVBNB(vBnb_);
        comptroller = IComptroller(comptroller_);
        vaiController = IVAIController(vaiController_);
        treasury = treasury_;
        treasuryPercentMantissa = treasuryPercentMantissa_;
    }

    /// @notice Liquidates a borrow and splits the seized amount between treasury and
    ///         liquidator. The liquidators should use this interface instead of calling
    ///         vToken.liquidateBorrow(...) directly.
    /// @dev For BNB borrows msg.value should be equal to repayAmount; otherwise msg.value
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
    )
        external
        payable
        nonReentrant
    {
        ensureNonzeroAddress(borrower);
        uint256 ourBalanceBefore = vTokenCollateral.balanceOf(address(this));
        if (vToken == address(vBnb)) {
            require(repayAmount == msg.value, "wrong amount");
            vBnb.liquidateBorrow{value: msg.value}(borrower, vTokenCollateral);
        } else {
            require(msg.value == 0, "you shouldn't pay for this");
            if (vToken == address(vaiController)) {
                _liquidateVAI(borrower, repayAmount, vTokenCollateral);
            } else {
                _liquidateBep20(IVBep20(vToken), borrower, repayAmount, vTokenCollateral);
            }
        }
        uint256 ourBalanceAfter = vTokenCollateral.balanceOf(address(this));
        uint256 seizedAmount = ourBalanceAfter - ourBalanceBefore;
        (uint256 ours, uint256 theirs) = _distributeLiquidationIncentive(vTokenCollateral, seizedAmount);
        emit LiquidateBorrowedTokens(msg.sender, borrower, repayAmount, address(vTokenCollateral), ours, theirs);
    }

    /// @notice Sets the new percent of the seized amount that goes to treasury. Should
    ///         be less than or equal to comptroller.liquidationIncentiveMantissa().sub(1e18).
    /// @param newTreasuryPercentMantissa New treasury percent (scaled by 10^18).
    function setTreasuryPercent(uint256 newTreasuryPercentMantissa) external onlyAdmin {
        require(
            newTreasuryPercentMantissa <= comptroller.liquidationIncentiveMantissa() - 1e18,
            "appetite too big"
        );
        emit NewLiquidationTreasuryPercent(treasuryPercentMantissa, newTreasuryPercentMantissa);
        treasuryPercentMantissa = newTreasuryPercentMantissa;
    }

    /// @dev Transfers BEP20 tokens to self, then approves vToken to take these tokens.
    function _liquidateBep20(
        IVBep20 vToken,
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    )
        internal
    {
        IERC20 borrowedToken = IERC20(vToken.underlying());
        uint256 actualRepayAmount = _transferBep20(borrowedToken, msg.sender, address(this), repayAmount);
        borrowedToken.safeApprove(address(vToken), 0);
        borrowedToken.safeApprove(address(vToken), actualRepayAmount);
        requireNoError(
            vToken.liquidateBorrow(borrower, actualRepayAmount, vTokenCollateral),
            "failed to liquidate"
        );
    }

    /// @dev Transfers BEP20 tokens to self, then approves vai to take these tokens.
    function _liquidateVAI(address borrower, uint256 repayAmount, IVToken vTokenCollateral)
        internal
    {
        IERC20 vai = IERC20(vaiController.getVAIAddress());
        vai.safeTransferFrom(msg.sender, address(this), repayAmount);
        vai.safeApprove(address(vaiController), repayAmount);

        (uint err,) = vaiController.liquidateVAI(borrower, repayAmount, vTokenCollateral);
        requireNoError(err, "failed to liquidate");
    }

    /// @dev Splits the received vTokens between the liquidator and treasury.
    function _distributeLiquidationIncentive(IVToken vTokenCollateral, uint256 siezedAmount)
        internal returns (uint256 ours, uint256 theirs)
    {
        (ours, theirs) = _splitLiquidationIncentive(siezedAmount);
        require(
            vTokenCollateral.transfer(msg.sender, theirs),
            "failed to transfer to liquidator"
        );
        require(
            vTokenCollateral.transfer(treasury, ours),
            "failed to transfer to treasury"
        );
        return (ours, theirs);
    }

    /// @dev Transfers tokens and returns the actual transfer amount
    function _transferBep20(IERC20 token, address from, address to, uint256 amount)
        internal
        returns (uint256 actualAmount)
    {
        uint256 prevBalance = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        return token.balanceOf(to) - prevBalance;
    }

    /// @dev Computes the amounts that would go to treasury and to the liquidator.
    function _splitLiquidationIncentive(uint256 seizedAmount)
        internal
        view
        returns (uint256 ours, uint256 theirs)
    {
        uint256 totalIncentive = comptroller.liquidationIncentiveMantissa();
        uint256 seizedForRepayment = seizedAmount * 1e18 / totalIncentive;
        ours = seizedForRepayment * treasuryPercentMantissa / 1e18;
        theirs = seizedAmount - ours;
        return (ours, theirs);
    }

    function requireNoError(uint errCode, string memory message) internal pure {
        if (errCode == uint(0)) {
            return;
        }

        bytes memory fullMessage = new bytes(bytes(message).length + 5);
        uint i;

        for (i = 0; i < bytes(message).length; i++) {
            fullMessage[i] = bytes(message)[i];
        }

        fullMessage[i+0] = bytes1(uint8(32));
        fullMessage[i+1] = bytes1(uint8(40));
        fullMessage[i+2] = bytes1(uint8(48 + ( errCode / 10 )));
        fullMessage[i+3] = bytes1(uint8(48 + ( errCode % 10 )));
        fullMessage[i+4] = bytes1(uint8(41));

        revert(string(fullMessage));
    }

    function ensureNonzeroAddress(address addr) internal pure {
        require(addr != address(0), "address should be nonzero");
    }
}
