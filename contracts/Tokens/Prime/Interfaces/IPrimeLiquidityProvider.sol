pragma solidity 0.8.13;

interface IPrimeLiquidityProvider {
    function releaseFunds(address token_) external;

    function accrueTokens(address token_) external;

    function tokenAmountAccrued(address token_) external view returns (uint256);

    function getEffectiveDistributionSpeed(address token_) external view returns (uint256);
}