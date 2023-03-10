pragma solidity 0.8.13;

import "../Tokens/VTokens/VToken.sol";
import "../Oracle/PriceOracle.sol";

abstract contract ComptrollerInterfaceG1 {
    /// @notice Indicator that this is a Comptroller contract (for inspection)
    bool public constant isComptroller = true;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external virtual returns (uint[] memory);

    function exitMarket(address vToken) external virtual returns (uint);

    /*** Policy Hooks ***/

    function mintAllowed(address vToken, address minter, uint mintAmount) external virtual returns (uint);

    function mintVerify(address vToken, address minter, uint mintAmount, uint mintTokens) external virtual;

    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external virtual returns (uint);

    function redeemVerify(address vToken, address redeemer, uint redeemAmount, uint redeemTokens) external virtual;

    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external virtual returns (uint);

    function borrowVerify(address vToken, address borrower, uint borrowAmount) external virtual {}

    function repayBorrowAllowed(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount
    ) external virtual returns (uint);

    function repayBorrowVerify(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount,
        uint borrowerIndex
    ) external virtual;

    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount
    ) external virtual returns (uint);

    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount,
        uint seizeTokens
    ) external virtual;

    function seizeAllowed(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external virtual returns (uint);

    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external virtual;

    function transferAllowed(
        address vToken,
        address src,
        address dst,
        uint transferTokens
    ) external virtual returns (uint);

    function transferVerify(address vToken, address src, address dst, uint transferTokens) external virtual;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint repayAmount
    ) external view virtual returns (uint, uint);

    function setMintedVAIOf(address owner, uint amount) external virtual returns (uint);
}

abstract contract ComptrollerInterfaceG2 is ComptrollerInterfaceG1 {
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint repayAmount
    ) external view virtual returns (uint, uint);
}

abstract contract ComptrollerInterfaceG3 is ComptrollerInterfaceG2 {
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint repayAmount
    ) external view virtual override returns (uint, uint) {}
}

abstract contract ComptrollerInterfaceG4 is ComptrollerInterfaceG3 {
    function getXVSAddress() public view virtual returns (address);
}

abstract contract ComptrollerInterface is ComptrollerInterfaceG4 {
    function markets(address) external view virtual returns (bool, uint);

    function oracle() external view virtual returns (PriceOracle);

    function getAccountLiquidity(address) external view virtual returns (uint, uint, uint);

    function getAssetsIn(address) external view virtual returns (VToken[] memory);

    function claimVenus(address) external virtual;

    function venusAccrued(address) external view virtual returns (uint);

    function venusSupplySpeeds(address) external view virtual returns (uint);

    function venusBorrowSpeeds(address) external view virtual returns (uint);

    function getAllMarkets() external view virtual returns (VToken[] memory);

    function venusSupplierIndex(address, address) external view virtual returns (uint);

    function venusInitialIndex() external view virtual returns (uint224);

    function venusBorrowerIndex(address, address) external view virtual returns (uint);

    function venusBorrowState(address) external view virtual returns (uint224, uint32);

    function venusSupplyState(address) external view virtual returns (uint224, uint32);

    function approvedDelegates(address borrower, address delegate) external view virtual returns (bool);
}

interface IVAIVault {
    function updatePendingRewards() external;
}

interface IComptroller {
    function liquidationIncentiveMantissa() external view returns (uint);

    /*** Treasury Data ***/
    function treasuryAddress() external view returns (address);

    function treasuryPercent() external view returns (uint);
}
