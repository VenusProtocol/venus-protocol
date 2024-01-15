// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
 * @title IPrimeLiquidityProvider
 * @author Venus
 * @notice Interface for PrimeLiquidityProvider
 */
interface IPrimeLiquidityProvider {
    /**
     * @notice Initialize the distribution of the token
     * @param tokens_ Array of addresses of the tokens to be intialized
     */
    function initializeTokens(address[] calldata tokens_) external;

    /**
     * @notice Pause fund transfer of tokens to Prime contract
     */
    function pauseFundsTransfer() external;

    /**
     * @notice Resume fund transfer of tokens to Prime contract
     */
    function resumeFundsTransfer() external;

    /**
     * @notice Set distribution speed (amount of token distribute per block or second)
     * @param tokens_ Array of addresses of the tokens
     * @param distributionSpeeds_ New distribution speeds for tokens
     */
    function setTokensDistributionSpeed(address[] calldata tokens_, uint256[] calldata distributionSpeeds_) external;

    /**
     * @notice Set max distribution speed for token (amount of maximum token distribute per block or second)
     * @param tokens_ Array of addresses of the tokens
     * @param maxDistributionSpeeds_ New distribution speeds for tokens
     */
    function setMaxTokensDistributionSpeed(
        address[] calldata tokens_,
        uint256[] calldata maxDistributionSpeeds_
    ) external;

    /**
     * @notice Set the prime token contract address
     * @param prime_ The new address of the prime token contract
     */
    function setPrimeToken(address prime_) external;

    /**
     * @notice Claim all the token accrued till last block or second
     * @param token_ The token to release to the Prime contract
     */
    function releaseFunds(address token_) external;

    /**
     * @notice A public function to sweep accidental ERC-20 transfers to this contract. Tokens are sent to user
     * @param token_ The address of the ERC-20 token to sweep
     * @param to_ The address of the recipient
     * @param amount_ The amount of tokens needs to transfer
     */
    function sweepToken(IERC20Upgradeable token_, address to_, uint256 amount_) external;

    /**
     * @notice Accrue token by updating the distribution state
     * @param token_ Address of the token
     */
    function accrueTokens(address token_) external;

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param loopsLimit Limit for the max loops can execute at a time
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external;

    /**
     * @notice Get rewards per block or second for token
     * @param token_ Address of the token
     * @return speed returns the per block or second reward
     */
    function getEffectiveDistributionSpeed(address token_) external view returns (uint256);

    /**
     * @notice Get the amount of tokens accrued
     * @param token_ Address of the token
     * @return Amount of tokens that are accrued
     */
    function tokenAmountAccrued(address token_) external view returns (uint256);
}
