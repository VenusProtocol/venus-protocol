pragma solidity ^0.5.16;

import "../../Comptroller/ComptrollerInterface.sol";
import "../../InterestRateModels/InterestRateModel.sol";

interface IProtocolShareReserveV5 {
    enum IncomeType {
        SPREAD,
        LIQUIDATION
    }

    function updateAssetsState(address comptroller, address asset, IncomeType kind) external;
}

contract VTokenStorageBase {
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
    ComptrollerInterface public comptroller;

    /**
     * @notice Model which tells what the current interest rate should be
     */
    InterestRateModel public interestRateModel;

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
     */
    uint public totalSupply;

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
}

contract VTokenStorage is VTokenStorageBase {
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}

contract VTokenInterface is VTokenStorage {
    /**
     * @notice Indicator that this is a vToken contract (for inspection)
     */
    bool public constant isVToken = true;

    /*** Market Events ***/

    /**
     * @notice Event emitted when interest is accrued
     */
    event AccrueInterest(uint cashPrior, uint interestAccumulated, uint borrowIndex, uint totalBorrows);

    /**
     * @notice Event emitted when tokens are minted
     */
    event Mint(address minter, uint mintAmount, uint mintTokens, uint256 totalSupply);

    /**
     * @notice Event emitted when tokens are minted behalf by payer to receiver
     */
    event MintBehalf(address payer, address receiver, uint mintAmount, uint mintTokens, uint256 totalSupply);

    /**
     * @notice Event emitted when tokens are redeemed
     */
    event Redeem(address redeemer, uint redeemAmount, uint redeemTokens, uint256 totalSupply);

    /**
     * @notice Event emitted when tokens are redeemed and fee is transferred
     */
    event RedeemFee(address redeemer, uint feeAmount, uint redeemTokens);

    /**
     * @notice Event emitted when underlying is borrowed
     */
    event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows);

    /**
     * @notice Event emitted when a borrow is repaid
     */
    event RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows);

    /**
     * @notice Event emitted when a borrow is liquidated
     */
    event LiquidateBorrow(
        address liquidator,
        address borrower,
        uint repayAmount,
        address vTokenCollateral,
        uint seizeTokens
    );

    /*** Admin Events ***/

    /**
     * @notice Event emitted when pendingAdmin is changed
     */
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /**
     * @notice Event emitted when pendingAdmin is accepted, which means admin has been updated
     */
    event NewAdmin(address oldAdmin, address newAdmin);

    /**
     * @notice Event emitted when comptroller is changed
     */
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    /**
     * @notice Event emitted when interestRateModel is changed
     */
    event NewMarketInterestRateModel(InterestRateModel oldInterestRateModel, InterestRateModel newInterestRateModel);

    /**
     * @notice Event emitted when the reserve factor is changed
     */
    event NewReserveFactor(uint oldReserveFactorMantissa, uint newReserveFactorMantissa);

    /**
     * @notice Event emitted when the reserves are added
     */
    event ReservesAdded(address benefactor, uint addAmount, uint newTotalReserves);

    /**
     * @notice Event emitted when the reserves are reduced
     */
    event ReservesReduced(address protocolShareReserve, uint reduceAmount, uint newTotalReserves);

    /**
     * @notice EIP20 Transfer event
     */
    event Transfer(address indexed from, address indexed to, uint amount);

    /**
     * @notice EIP20 Approval event
     */
    event Approval(address indexed owner, address indexed spender, uint amount);

    /**
     * @notice Event emitted when block delta for reduce reserves get updated
     */
    event NewReduceReservesBlockDelta(uint256 oldReduceReservesBlockDelta, uint256 newReduceReservesBlockDelta);

    /**
     * @notice Event emitted when address of ProtocolShareReserve contract get updated
     */
    event NewProtocolShareReserve(address indexed oldProtocolShareReserve, address indexed newProtocolShareReserve);

    /**
     * @notice Failure event
     */
    event Failure(uint error, uint info, uint detail);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControlManager(address oldAccessControlAddress, address newAccessControlAddress);

    /*** User Interface ***/

    function transfer(address dst, uint amount) external returns (bool);

    function transferFrom(address src, address dst, uint amount) external returns (bool);

    function approve(address spender, uint amount) external returns (bool);

    function balanceOfUnderlying(address owner) external returns (uint);

    function totalBorrowsCurrent() external returns (uint);

    function borrowBalanceCurrent(address account) external returns (uint);

    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint);

    /*** Admin Function ***/
    function _setPendingAdmin(address payable newPendingAdmin) external returns (uint);

    /*** Admin Function ***/
    function _acceptAdmin() external returns (uint);

    /*** Admin Function ***/
    function _setReserveFactor(uint newReserveFactorMantissa) external returns (uint);

    /*** Admin Function ***/
    function _reduceReserves(uint reduceAmount) external returns (uint);

    function balanceOf(address owner) external view returns (uint);

    function allowance(address owner, address spender) external view returns (uint);

    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint);

    function borrowRatePerBlock() external view returns (uint);

    function supplyRatePerBlock() external view returns (uint);

    function getCash() external view returns (uint);

    function exchangeRateCurrent() public returns (uint);

    function accrueInterest() public returns (uint);

    /*** Admin Function ***/
    function _setComptroller(ComptrollerInterface newComptroller) public returns (uint);

    /*** Admin Function ***/
    function _setInterestRateModel(InterestRateModel newInterestRateModel) public returns (uint);

    function borrowBalanceStored(address account) public view returns (uint);

    function exchangeRateStored() public view returns (uint);
}

contract VBep20Interface {
    /*** User Interface ***/

    function mint(uint mintAmount) external returns (uint);

    function mintBehalf(address receiver, uint mintAmount) external returns (uint);

    function redeem(uint redeemTokens) external returns (uint);

    function redeemUnderlying(uint redeemAmount) external returns (uint);

    function borrow(uint borrowAmount) external returns (uint);

    function repayBorrow(uint repayAmount) external returns (uint);

    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);

    function liquidateBorrow(
        address borrower,
        uint repayAmount,
        VTokenInterface vTokenCollateral
    ) external returns (uint);

    /*** Admin Functions ***/

    function _addReserves(uint addAmount) external returns (uint);
}

contract VDelegatorInterface {
    /**
     * @notice Emitted when implementation is changed
     */
    event NewImplementation(address oldImplementation, address newImplementation);

    /**
     * @notice Called by the admin to update the implementation of the delegator
     * @param implementation_ The address of the new implementation for delegation
     * @param allowResign Flag to indicate whether to call _resignImplementation on the old implementation
     * @param becomeImplementationData The encoded bytes data to be passed to _becomeImplementation
     */
    function _setImplementation(
        address implementation_,
        bool allowResign,
        bytes memory becomeImplementationData
    ) public;
}

contract VDelegateInterface {
    /**
     * @notice Called by the delegator on a delegate to initialize it for duty
     * @dev Should revert if any issues arise which make it unfit for delegation
     * @param data The encoded bytes data for any initialization
     */
    function _becomeImplementation(bytes memory data) public;

    /**
     * @notice Called by the delegator on a delegate to forfeit its responsibility
     */
    function _resignImplementation() public;
}
