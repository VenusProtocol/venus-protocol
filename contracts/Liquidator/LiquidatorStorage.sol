// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ILiquidatorStorage } from "./interfaces/ILiquidatorStorage.sol";

contract LiquidatorStorage is ILiquidatorStorage {
    /* State */

    /// @notice Percent of seized amount that goes to treasury.
    uint256 public treasuryPercentMantissa;

    /// @notice Mapping of addresses allowed to liquidate an account if liquidationRestricted[borrower] == true
    mapping(address borrower => mapping(address liquidator => bool)) public allowedLiquidatorsByAccount;

    /// @notice Whether the liquidations are restricted to enabled allowedLiquidatorsByAccount addresses only
    mapping(address borrower => bool) public liquidationRestricted;

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
