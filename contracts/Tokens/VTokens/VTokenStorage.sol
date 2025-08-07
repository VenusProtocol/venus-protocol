// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IComptroller } from "../../Comptroller/interfaces/IComptroller.sol";
import { InterestRateModelV8 } from "../../InterestRateModels/InterestRateModelV8.sol";
import { IVTokenStorage } from "./interfaces/IVTokenStorage.sol";

contract VTokenStorage is IVTokenStorage {
    /**
     * @dev Guard variable for re-entrancy checks
     */
    bool internal _notEntered;

    /**
     * @notice EIP-20 token name for this token
     */
    string public name;

    /**
     * @notice EIP-20 token symbol for this token
     */
    string public symbol;

    /**
     * @notice EIP-20 token decimals for this token
     */
    uint8 public decimals;

    /**
     * @notice Maximum borrow rate that can ever be applied (.0005% / block)
     */

    uint internal constant borrowRateMaxMantissa = 0.0005e16;

    /**
     * @notice Maximum fraction of interest that can be set aside for reserves
     */
    uint internal constant reserveFactorMaxMantissa = 1e18;

    /**
     * @notice Administrator for this contract
     */
    address payable public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address payable public pendingAdmin;

    /**
     * @notice Contract which oversees inter-vToken operations
     */
    IComptroller public comptroller;

    /**
     * @notice Model which tells what the current interest rate should be
     */
    InterestRateModelV8 public interestRateModel;

    /**
     * @notice Initial exchange rate used when minting the first VTokens (used when totalSupply = 0)
     */
    uint internal initialExchangeRateMantissa;

    /**
     * @notice Fraction of interest currently set aside for reserves
     */
    uint public reserveFactorMantissa;

    /**
     * @notice Block number that interest was last accrued at
     */
    uint public accrualBlockNumber;

    /**
     * @notice Accumulator of the total earned interest rate since the opening of the market
     */
    uint public borrowIndex;

    /**
     * @notice Total amount of outstanding borrows of the underlying in this market
     */
    uint public totalBorrows;

    /**
     * @notice Total amount of reserves of the underlying held in this market
     */
    uint public totalReserves;

    /**
     * @notice Total number of tokens in circulation
     * @dev internal to avoid conflicts with IERC20.totalSupply()
     */
    uint internal _totalSupply;

    /**
     * @notice Official record of token balances for each account
     */
    mapping(address => uint) internal accountTokens;

    /**
     * @notice Approved token transfer amounts on behalf of others
     */
    mapping(address => mapping(address => uint)) internal transferAllowances;

    /**
     * @notice Mapping of account addresses to outstanding borrow balances
     */
    mapping(address => BorrowSnapshot) internal accountBorrows;

    /**
     * @notice Underlying asset for this VToken
     */
    address public underlying;

    /**
     * @notice Implementation address for this contract
     */
    address public implementation;

    /**
     * @notice delta block after which reserves will be reduced
     */
    uint public reduceReservesBlockDelta;

    /**
     * @notice last block number at which reserves were reduced
     */
    uint public reduceReservesBlockNumber;

    /**
     * @notice address of protocol share reserve contract
     */
    address payable public protocolShareReserve;

    /**
     * @notice address of accessControlManager
     */

    address public accessControlManager;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
