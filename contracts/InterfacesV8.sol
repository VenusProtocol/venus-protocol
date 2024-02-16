// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

interface IVToken is IERC20Upgradeable {
    function redeem(uint256 redeemTokens) external returns (uint256);

    function borrowBalanceCurrent(address borrower) external returns (uint256);

    function comptroller() external view returns (IComptroller);
}

interface IVBep20 is IVToken {
    function borrowBehalf(address borrower, uint256 borrowAmount) external returns (uint256);

    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);

    function liquidateBorrow(
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    ) external returns (uint256);

    function underlying() external view returns (address);
}

interface IVBNB is IVToken {
    function liquidateBorrow(address borrower, IVToken vTokenCollateral) external payable;
}

interface IVAIController {
    function liquidateVAI(
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    ) external returns (uint256, uint256);

    function getVAIAddress() external view returns (address);

    function getVAIRepayAmount(address borrower) external view returns (uint256);
}

interface IComptroller {
    enum Action {
        MINT,
        REDEEM,
        BORROW,
        REPAY,
        SEIZE,
        LIQUIDATE,
        TRANSFER,
        ENTER_MARKET,
        EXIT_MARKET
    }

    function _setActionsPaused(address[] calldata markets_, Action[] calldata actions_, bool paused_) external;

    function liquidationIncentiveMantissa() external view returns (uint256);

    function vaiController() external view returns (IVAIController);

    function liquidatorContract() external view returns (address);

    function oracle() external view returns (ResilientOracleInterface);

    function actionPaused(address market, Action action) external view returns (bool);

    function markets(address) external view returns (bool, uint256, bool);

    function isForcedLiquidationEnabled(address) external view returns (bool);
}

interface ILiquidator {
    function restrictLiquidation(address borrower) external;

    function unrestrictLiquidation(address borrower) external;

    function addToAllowlist(address borrower, address liquidator) external;

    function removeFromAllowlist(address borrower, address liquidator) external;

    function liquidateBorrow(
        address vToken,
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    ) external payable;

    function setTreasuryPercent(uint256 newTreasuryPercentMantissa) external;

    function treasuryPercentMantissa() external view returns (uint256);
}

interface IProtocolShareReserve {
    enum IncomeType {
        SPREAD,
        LIQUIDATION
    }

    function updateAssetsState(address comptroller, address asset, IncomeType kind) external;
}

interface IWBNB is IERC20Upgradeable {
    function deposit() external payable;
}
