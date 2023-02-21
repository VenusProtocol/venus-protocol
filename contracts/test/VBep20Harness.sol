pragma solidity ^0.5.16;

import "../Tokens/VTokens/VBep20Immutable.sol";
import "../Tokens/VTokens/VBep20Delegator.sol";
import "../Tokens/VTokens/VBep20Delegate.sol";
import "./ComptrollerScenario.sol";

contract VBep20Harness is VBep20Immutable {
    uint internal blockNumber = 100000;
    uint internal harnessExchangeRate;
    bool internal harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

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

    function initializeHarness(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint initialExchangeRateMantissa_,
        string calldata name_,
        string calldata symbol_,
        uint8 decimals_
    ) external {
        super.initialize(comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_);
        // Set underlying and sanity check it
        underlying = underlying_;
        EIP20Interface(underlying).totalSupply();
    }

    function doTransferOut(address payable to, uint amount) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
    }

    function exchangeRateStoredInternal() internal view returns (MathError, uint) {
        if (harnessExchangeRateStored) {
            return (MathError.NO_ERROR, harnessExchangeRate);
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockNumber() internal view returns (uint) {
        return blockNumber;
    }

    function harnessGetBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint) {
        return borrowRateMaxMantissa;
    }

    function getStableBorrowRateMaxMantissa() external pure returns (uint256) {
        return stableBorrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockNumber(uint _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
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

    function harnessSetTotalSupply(uint totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetStableBorrows(uint256 stableBorrows_) external {
        stableBorrows = stableBorrows_;
    }

    function harnessSetTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessSetStableInterestRateModel(StableRateModel newStableInterestRateModel) public returns (uint256) {
        uint err = setStableInterestRateModel(newStableInterestRateModel);
        return err;
    }

    function harnessRepayBorrowStable(uint amount) public {
        repayBorrowStable(amount);
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

    function harnessAccountStableBorrows(
        address account
    ) external view returns (uint256 principal, uint256 interestIndex, uint256 lastBlockAccrued) {
        StableBorrowSnapshot memory snapshot = accountStableBorrows[account];
        return (snapshot.principal, snapshot.interestIndex, snapshot.lastBlockAccrued);
    }

    function harnessSetAccountBorrows(address account, uint principal, uint interestIndex) public {
        accountBorrows[account] = BorrowSnapshot({ principal: principal, interestIndex: interestIndex });
    }

    function harnessSetAccountStableBorrows(
        address account,
        uint256 principal,
        uint256 interestIndex,
        uint256 stableRateMantissa,
        uint256 lastBlock
    ) external {
        accountStableBorrows[account] = StableBorrowSnapshot({
            principal: principal,
            interestIndex: interestIndex,
            stableRateMantissa: stableRateMantissa,
            lastBlockAccrued: lastBlock
        });
    }

    function harnessSetBorrowIndex(uint borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessSetStableBorrowIndex(uint256 stableBorrowIndex_) external {
        stableBorrowIndex = stableBorrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint borrowAmount) public returns (uint) {
        borrowFresh(account, account, borrowAmount, InterestRateMode.VARIABLE);
    }

    function harnessBorrowStableFresh(address payable account, uint borrowAmount) public returns (uint) {
        borrowFresh(account, account, borrowAmount, InterestRateMode.STABLE);
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayBorrowFresh(payer, account, repayAmount, InterestRateMode.VARIABLE);
        return err;
    }

    function harnessRepayBorrowStableFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayBorrowFresh(payer, account, repayAmount, InterestRateMode.STABLE);
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

    function harnessSetAvgStableBorrowRate(uint256 averageStableBorrowRate_) public {
        averageStableBorrowRate = averageStableBorrowRate_;
    }

    function harnessStableBorrows(uint256 stableBorrows_) public {
        stableBorrows = stableBorrows_;
    }

    function accrueStableInterest(uint256 blockDelta) public returns (uint256) {
        return _accrueStableInterest(blockDelta);
    }

    function harnessUpdateUserStableBorrowBalance(address account) public returns (uint256) {
        return _updateUserStableBorrowBalance(account);
    }
}

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

contract VEvil is VBep20Scenario {
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
        VBep20Scenario(
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

    function evilSeize(VToken treasure, address liquidator, address borrower, uint seizeTokens) public returns (uint) {
        return treasure.seize(liquidator, borrower, seizeTokens);
    }
}

contract VBep20DelegatorScenario is VBep20Delegator {
    constructor(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        address implementation_,
        bytes memory becomeImplementationData
    )
        public
        VBep20Delegator(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_,
            admin_,
            implementation_,
            becomeImplementationData
        )
    {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }
}

contract VBep20DelegateHarness is VBep20Delegate {
    event Log(string x, address y);
    event Log(string x, uint y);

    uint internal blockNumber = 100000;
    uint internal harnessExchangeRate;
    bool internal harnessExchangeRateStored;

    mapping(address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (MathError, uint) {
        if (harnessExchangeRateStored) {
            return (MathError.NO_ERROR, harnessExchangeRate);
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(address payable to, uint amount) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
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
        borrowFresh(account, account, borrowAmount, InterestRateMode.VARIABLE);
    }

    function harnessBorrowStableFresh(address payable account, uint256 borrowAmount) public returns (uint) {
        borrowFresh(account, account, borrowAmount, InterestRateMode.STABLE);
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayBorrowFresh(payer, account, repayAmount, InterestRateMode.VARIABLE);
        return err;
    }

    function harnessRepayBorrowStableFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayBorrowFresh(payer, account, repayAmount, InterestRateMode.STABLE);
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

contract VBep20DelegateScenario is VBep20Delegate {
    constructor() public {}

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

contract VBep20DelegateScenarioExtra is VBep20DelegateScenario {
    function iHaveSpoken() public pure returns (string memory) {
        return "i have spoken";
    }

    function itIsTheWay() public {
        admin = address(1); // make a change to test effect
    }

    function babyYoda() public pure {
        revert("protect the baby");
    }
}
