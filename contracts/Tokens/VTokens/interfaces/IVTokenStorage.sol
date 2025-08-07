// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IComptroller } from "../../../Comptroller/interfaces/IComptroller.sol";
import { InterestRateModelV8 } from "../../../InterestRateModels/InterestRateModelV8.sol";

interface IVTokenStorage {
    /**
     * @notice Container for borrow balance information
     * @member principal Total balance (with accrued interest), after applying the most recent balance-changing action
     * @member interestIndex Global borrowIndex as of the most recent balance-changing action
     */
    struct BorrowSnapshot {
        uint principal;
        uint interestIndex;
    }

    /**
     * @notice EIP-20 token name for this token
     */
    function name() external view returns (string memory);

    /**
     * @notice EIP-20 token symbol for this token
     */
    function symbol() external view returns (string memory);

    /**
     * @notice EIP-20 token decimals for this token
     */
    function decimals() external view returns (uint8);

    /**
     * @notice Administrator for this contract
     */
    function admin() external view returns (address payable);

    /**
     * @notice Pending administrator for this contract
     */
    function pendingAdmin() external view returns (address payable);

    /**
     * @notice Contract which oversees inter-vToken operations
     */
    function comptroller() external view returns (IComptroller);

    /**
     * @notice Model which tells what the current interest rate should be
     */
    function interestRateModel() external view returns (InterestRateModelV8);

    /**
     * @notice Fraction of interest currently set aside for reserves
     */
    function reserveFactorMantissa() external view returns (uint256);

    /**
     * @notice Block number that interest was last accrued at
     */
    function accrualBlockNumber() external view returns (uint256);

    /**
     * @notice Accumulator of the total earned interest rate since the opening of the market
     */
    function borrowIndex() external view returns (uint256);

    /**
     * @notice Total amount of outstanding borrows of the underlying in this market
     */
    function totalBorrows() external view returns (uint256);

    /**
     * @notice Total amount of reserves of the underlying held in this market
     */
    function totalReserves() external view returns (uint256);

    /**
     * @notice Underlying asset for this VToken
     */
    function underlying() external view returns (address);

    /**
     * @notice Implementation address for this contract
     */
    function implementation() external view returns (address);

    /**
     * @notice Delta block after which reserves will be reduced
     */
    function reduceReservesBlockDelta() external view returns (uint256);

    /**
     * @notice Last block number at which reserves were reduced
     */
    function reduceReservesBlockNumber() external view returns (uint256);

    /**
     * @notice Address of protocol share reserve contract
     */
    function protocolShareReserve() external view returns (address payable);

    /**
     * @notice Address of accessControlManager
     */
    function accessControlManager() external view returns (address);
}
