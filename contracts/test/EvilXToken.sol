pragma solidity ^0.5.16;

import "../Tokens/VTokens/VBep20Immutable.sol";
import "../Tokens/VTokens/VBep20Delegator.sol";
import "../Tokens/VTokens/VBep20Delegate.sol";
import "./ComptrollerScenario.sol";
import "../Comptroller/ComptrollerInterface.sol";

contract VBep20Scenario is VBep20Immutable {
    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    )
        public
        VBep20Immutable(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_
        )
    {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockNumber() internal view returns (uint) {
        ComptrollerScenario comptrollerScenario = ComptrollerScenario(address(comptroller));
        return comptrollerScenario.blockNumber();
    }
}

// doTransferOut method of this token supposed to be compromised and contians malicious code which
// can be used by attacker to compromise the protocol working.
contract EvilXToken is VBep20Delegate {
    event Log(string x, address y);
    event Log(string x, uint y);
    event LogLiquidity(uint liquidity);

    uint internal blockNumber = 100000;
    uint internal harnessExchangeRate;
    bool internal harnessExchangeRateStored;

    address public comptrollerAddress;

    mapping(address => bool) public failTransferToAddresses;

    function setComptrollerAddress(address _comptrollerAddress) external {
        comptrollerAddress = _comptrollerAddress;
    }

    function exchangeRateStoredInternal() internal view returns (MathError, uint) {
        if (harnessExchangeRateStored) {
            return (MathError.NO_ERROR, harnessExchangeRate);
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(address payable to, uint amount) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        super.doTransferOut(to, amount);

        // Checking the Liquidity of the user after the tranfer.
        // solhint-disable-next-line no-unused-vars
        (uint errorCode, uint liquidity, uint shortfall) = ComptrollerInterface(comptrollerAddress).getAccountLiquidity(
            msg.sender
        );
        emit LogLiquidity(liquidity);
        return;
    }

    function getBlockNumber() internal view returns (uint) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint) {
        return borrowRateMaxMantissa;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint blocks) public {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetAccrualBlockNumber(uint _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
    }

    function harnessSetTotalSupply(uint totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessIncrementTotalBorrows(uint addtlBorrow_) public {
        totalBorrows = totalBorrows + addtlBorrow_;
    }

    function harnessSetTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(uint totalSupply_, uint totalBorrows_, uint totalReserves_) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
    }

    function harnessSetExchangeRate(uint exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint mintAmount) public returns (uint) {
        (uint err, ) = super.mintFresh(account, mintAmount);
        return err;
    }

    function harnessMintBehalfFresh(address payer, address receiver, uint mintAmount) public returns (uint) {
        (uint err, ) = super.mintBehalfFresh(payer, receiver, mintAmount);
        return err;
    }

    function harnessRedeemFresh(
        address payable account,
        uint vTokenAmount,
        uint underlyingAmount
    ) public returns (uint) {
        return super.redeemFresh(account, vTokenAmount, underlyingAmount);
    }

    function harnessAccountBorrows(address account) public view returns (uint principal, uint interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(address account, uint principal, uint interestIndex) public {
        accountBorrows[account] = BorrowSnapshot({ principal: principal, interestIndex: interestIndex });
    }

    function harnessSetBorrowIndex(uint borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint borrowAmount) public returns (uint) {
        return borrowFresh(account, account, borrowAmount);
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayBorrowFresh(payer, account, repayAmount);
        return err;
    }

    function harnessLiquidateBorrowFresh(
        address liquidator,
        address borrower,
        uint repayAmount,
        VToken vTokenCollateral
    ) public returns (uint) {
        (uint err, ) = liquidateBorrowFresh(liquidator, borrower, repayAmount, vTokenCollateral);
        return err;
    }

    function harnessReduceReservesFresh(uint amount) public returns (uint) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint newReserveFactorMantissa) public returns (uint) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint amount) public returns (uint) {
        return comptroller.borrowAllowed(address(this), msg.sender, amount);
    }
}
