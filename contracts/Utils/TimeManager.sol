// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SECONDS_PER_YEAR } from "@venusprotocol/solidity-utilities/contracts/constants.sol";

abstract contract TimeManager {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable blocksOrSecondsPerYear;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    bool public immutable isTimeBased;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    function() view returns (uint256) private immutable _getCurrentSlot;

    /// @notice Thrown on invaid arguments
    error InvalidBlocksPerYear();

    /**
     * @param timeBased_ A boolean indicating whether the contract is based on time or block.
     * If timeBased is true than blocksPerYear_ param is ignored as blocksOrSecondsPerYear is set to SECONDS_PER_YEAR
     * @param blocksPerYear_ The number of blocks per year
     * @custom:error InvalidBlocksPerYear is thrown if blocksPerYear entered is zero
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor(bool timeBased_, uint256 blocksPerYear_) {
        if (!timeBased_ && blocksPerYear_ == 0) {
            revert InvalidBlocksPerYear();
        }

        isTimeBased = timeBased_;
        blocksOrSecondsPerYear = timeBased_ ? SECONDS_PER_YEAR : blocksPerYear_;
        _getCurrentSlot = timeBased_ ? _getBlockTimestamp : _getBlockNumber;
    }

    /**
     * @dev Function to simply retrieve block number or block timestamp
     *  This exists mainly for inheriting test contracts to stub this result.
     * @return Current block number or block timestamp
     */
    function getBlockNumberOrTimestamp() public view virtual returns (uint256) {
        return _getCurrentSlot();
    }

    /**
     * @notice Returns the current timestamp in seconds
     * @return The current timestamp
     */
    function _getBlockTimestamp() private view returns (uint256) {
        return block.timestamp;
    }

    /**
     * @notice Returns the current block number
     * @return The current block number
     */
    function _getBlockNumber() private view returns (uint256) {
        return block.number;
    }
}
