// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

contract LiquidatorStorage {
    /* State */

    /// @notice Percent of seized amount that goes to treasury.
    uint256 public treasuryPercentMantissa;

    /// @notice Mapping of addresses allowed to liquidate an account if liquidationRestricted[borrower] == true
    mapping(address => mapping(address => bool)) public allowedLiquidatorsByAccount;

    /// @notice Whether the liquidations are restricted to enabled allowedLiquidatorsByAccount addresses only
    mapping(address => bool) public liquidationRestricted;

    /// @notice minimum amount of VAI liquidation threshold
    uint256 public minLiquidatableVAI;

    /// @notice check for liquidation of VAI
    bool public forceVAILiquidate;

    /// @notice assests whose redeem is pending to reduce reserves
    address[] public pendingRedeem;

    /// @notice protocol share reserve contract address
    address public protocolShareReserve;

    /// @dev Size of chunk to consider when redeeming underlying at the time of liquidation
    uint256 internal pendingRedeemChunkLength;

    /// @notice gap to prevent collision in inheritance
    uint256[49] private __gap;
}
