pragma solidity 0.8.13;

import "../Tokens/VTokens/VToken.sol";
import "../Oracle/PriceOracle.sol";

abstract contract UpdatedComptrollerInterfaceG1 {
    /// @notice Indicator that this is a Comptroller contract (for inspection)
    bool public constant isComptroller = true;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external virtual returns (uint[] memory);

    function exitMarket(address vToken) external virtual returns (uint);

    /*** Policy Hooks ***/

    function mintAllowed(address vToken, address minter, uint mintAmount) external virtual returns (uint);

    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external virtual returns (uint);

    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external virtual returns (uint);

    function repayBorrowAllowed(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount
    ) external virtual returns (uint);

    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount
    ) external virtual returns (uint);

    function seizeAllowed(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external virtual returns (uint);

    function transferAllowed(
        address vToken,
        address src,
        address dst,
        uint transferTokens
    ) external virtual returns (uint);

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint repayAmount
    ) external view virtual returns (uint, uint);

    function setMintedVAIOf(address owner, uint amount) external virtual returns (uint);
}

abstract contract UpdatedComptrollerInterfaceG2 is UpdatedComptrollerInterfaceG1 {
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint repayAmount
    ) external view virtual returns (uint, uint);
}

abstract contract UpdatedComptrollerInterface is UpdatedComptrollerInterfaceG2 {
    function markets(address) external view virtual returns (bool, uint);

    function oracle() external view virtual returns (PriceOracle);

    function getAccountLiquidity(address) external view virtual returns (uint, uint, uint);

    function getAssetsIn(address) external view virtual returns (VToken[] memory);

    function claimVenus(address) external virtual;

    function venusAccrued(address) external view virtual returns (uint);

    function venusSpeeds(address) external view virtual returns (uint);

    function getAllMarkets() external view virtual returns (VToken[] memory);

    function venusSupplierIndex(address, address) external view virtual returns (uint);

    function venusInitialIndex() external view virtual returns (uint224);

    function venusBorrowerIndex(address, address) external view virtual returns (uint);

    function venusBorrowState(address) external view virtual returns (uint224, uint32);

    function venusSupplyState(address) external view virtual returns (uint224, uint32);
}
