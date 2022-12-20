pragma solidity ^0.5.16;

import "../Tokens/VTokens/VToken.sol";
import "../Oracle/PriceOracle.sol";

contract UpdatedComptrollerInterfaceG1 {
    /// @notice Indicator that this is a Comptroller contract (for inspection)
    bool public constant isComptroller = true;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory);

    function exitMarket(address vToken) external returns (uint);

    /*** Policy Hooks ***/

    function mintAllowed(address vToken, address minter, uint mintAmount) external returns (uint);

    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external returns (uint);

    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external returns (uint);

    function repayBorrowAllowed(
        address vToken,
        address payer,
        address borrower,
        uint repayAmount
    ) external returns (uint);

    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount
    ) external returns (uint);

    function seizeAllowed(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) external returns (uint);

    function transferAllowed(address vToken, address src, address dst, uint transferTokens) external returns (uint);

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint repayAmount
    ) external view returns (uint, uint);

    function setMintedVAIOf(address owner, uint amount) external returns (uint);
}

contract UpdatedComptrollerInterfaceG2 is UpdatedComptrollerInterfaceG1 {
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint repayAmount
    ) external view returns (uint, uint);
}

contract UpdatedComptrollerInterface is UpdatedComptrollerInterfaceG2 {
    function markets(address) external view returns (bool, uint);

    function oracle() external view returns (PriceOracle);

    function getAccountLiquidity(address) external view returns (uint, uint, uint);

    function getAssetsIn(address) external view returns (VToken[] memory);

    function claimVenus(address) external;

    function venusAccrued(address) external view returns (uint);

    function venusSpeeds(address) external view returns (uint);

    function getAllMarkets() external view returns (VToken[] memory);

    function venusSupplierIndex(address, address) external view returns (uint);

    function venusInitialIndex() external view returns (uint224);

    function venusBorrowerIndex(address, address) external view returns (uint);

    function venusBorrowState(address) external view returns (uint224, uint32);

    function venusSupplyState(address) external view returns (uint224, uint32);
}
