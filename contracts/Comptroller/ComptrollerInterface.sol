// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "../Tokens/VTokens/VToken.sol";
import { VAIControllerInterface } from "../Tokens/VAI/VAIControllerInterface.sol";
import { WeightFunction } from "./Diamond/interfaces/IFacetBase.sol";

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

interface ComptrollerInterface {
    /// @notice Indicator that this is a Comptroller contract (for inspection)
    function isComptroller() external pure returns (bool);

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory);

    function exitMarket(address vToken) external returns (uint);

    /*** Policy Hooks ***/

    function mintAllowed(address vToken, address minter, uint mintAmount) external returns (uint);

    function mintVerify(address vToken, address minter, uint mintAmount, uint mintTokens) external;

    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external returns (uint);

    function redeemVerify(address vToken, address redeemer, uint redeemAmount, uint redeemTokens) external;

    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external returns (uint);

    function borrowVerify(address vToken, address borrower, uint borrowAmount) external;

    function executeFlashLoan(
        address payable initiator,
        address payable receiver,
        VToken[] calldata assets,
        uint256[] calldata amounts,
        bytes calldata param
    ) external;

    function repayBorrowAllowed(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount
    ) external returns (uint);

    function repayBorrowVerify(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount,
        uint borrowerIndex
    ) external;

    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount
    ) external returns (uint);

    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount,
        uint seizeTokens
    ) external;

    function seizeAllowed(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external returns (uint);

    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external;

    function transferAllowed(address vToken, address src, address dst, uint transferTokens) external returns (uint);

    function transferVerify(address vToken, address src, address dst, uint transferTokens) external;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint repayAmount
    ) external view returns (uint, uint);

    function liquidateCalculateSeizeTokens(
        address borrower,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint repayAmount
    ) external view returns (uint, uint);

    function setMintedVAIOf(address owner, uint amount) external returns (uint);

    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint repayAmount
    ) external view returns (uint, uint);

    function getXVSAddress() external view returns (address);

    function markets(address) external view returns (bool, uint);

    function oracle() external view returns (ResilientOracleInterface);

    function getAccountLiquidity(address) external view returns (uint, uint, uint);

    function getAssetsIn(address) external view returns (VToken[] memory);

    function claimVenus(address) external;

    function venusAccrued(address) external view returns (uint);

    function venusSupplySpeeds(address) external view returns (uint);

    function venusBorrowSpeeds(address) external view returns (uint);

    function getAllMarkets() external view returns (VToken[] memory);

    function venusSupplierIndex(address, address) external view returns (uint);

    function venusInitialIndex() external view returns (uint224);

    function venusBorrowerIndex(address, address) external view returns (uint);

    function venusBorrowState(address) external view returns (uint224, uint32);

    function venusSupplyState(address) external view returns (uint224, uint32);

    function approvedDelegates(address borrower, address delegate) external view returns (bool);

    function vaiController() external view returns (VAIControllerInterface);

    function protocolPaused() external view returns (bool);

    function actionPaused(address market, Action action) external view returns (bool);

    function mintedVAIs(address user) external view returns (uint);

    function vaiMintRate() external view returns (uint);

    function delegateAuthorizationFlashloan(
        address account,
        address market,
        address delegate
    ) external view returns (bool);
    function userPoolId(address account) external view returns (uint96);

    function getLiquidationIncentive(address vToken) external view returns (uint256);

    function getEffectiveLiquidationIncentive(address account, address vToken) external view returns (uint256);

    function getEffectiveLtvFactor(
        address account,
        address vToken,
        WeightFunction weightingStrategy
    ) external view returns (uint256);

    function lastPoolId() external view returns (uint96);

    function corePoolId() external pure returns (uint96);

    function pools(uint96 poolId) external view returns (string memory label);

    function getPoolVTokens(uint96 poolId) external view returns (address[] memory);

    function poolMarkets(
        uint96 poolId,
        address vToken
    )
        external
        view
        returns (
            bool isListed,
            uint256 collateralFactorMantissa,
            bool isVenus,
            uint256 liquidationThresholdMantissa,
            uint256 liquidationIncentiveMantissa,
            uint96 marketPoolId,
            bool isBorrowAllowed
        );
}

interface IVAIVault {
    function updatePendingRewards() external;
}

interface IComptroller {
    /*** Treasury Data ***/
    function treasuryAddress() external view returns (address);

    function treasuryPercent() external view returns (uint);
}
