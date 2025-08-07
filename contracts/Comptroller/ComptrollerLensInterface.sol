pragma solidity 0.8.25;

import "../Tokens/VTokens/VToken.sol";

interface ComptrollerLensInterface {
    function liquidateCalculateSeizeTokens(
        address borrower,
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    function liquidateVAICalculateSeizeTokens(
        address borrower,
        address comptroller,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    function getHypotheticalAccountLiquidity(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        function(address) external view returns (uint256) weight
    ) external view returns (uint256, uint256, uint256);

    function getAccountHealthSnapshot(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        function(address) external view returns (uint256) weight
    ) external view returns (uint256, uint256, uint256, uint256, uint256);
}
