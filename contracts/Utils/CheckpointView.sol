// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Venus CheckpointView Contract
 * @notice A contract that calls a view function from two different contracts
 *   based on whether a checkpoint in time has passed. Using this contract, we
 *   can change dependencies at a certain timestamp, which is useful for
 *   scheduled changes in, e.g., interest rate models.
 * @author Venus
 */
contract CheckpointView {
    using Address for address;

    address public immutable DATA_SOURCE_1;
    address public immutable DATA_SOURCE_2;
    uint256 public immutable CHECKPOINT_TIMESTAMP;

    /**
     * @notice Constructor
     * @param dataSource1 Data source to use before the checkpoint
     * @param dataSource2 Data source to use after the checkpoint
     * @param checkpointTimestamp Checkpoint timestamp
     */
    constructor(address dataSource1, address dataSource2, uint256 checkpointTimestamp) {
        ensureNonzeroAddress(address(dataSource1));
        ensureNonzeroAddress(address(dataSource2));
        DATA_SOURCE_1 = dataSource1;
        DATA_SOURCE_2 = dataSource2;
        CHECKPOINT_TIMESTAMP = checkpointTimestamp;
    }

    /**
     * @notice Fallback function that proxies the view calls to the current data source
     * @param input Input data (with a function selector) for the call
     */
    fallback(bytes calldata input) external returns (bytes memory) {
        return _getCurrentDataSource().functionStaticCall(input);
    }

    /**
     * @notice Returns the current data source contract (either the old one or the new one)
     * @return Data source contract in use
     */
    function currentDataSource() external view returns (address) {
        return _getCurrentDataSource();
    }

    /**
     * @dev Returns the current data source contract (either the old one or the new one)
     * @return Data source contract in use
     */
    function _getCurrentDataSource() internal view returns (address) {
        return (block.timestamp < CHECKPOINT_TIMESTAMP) ? DATA_SOURCE_1 : DATA_SOURCE_2;
    }
}
