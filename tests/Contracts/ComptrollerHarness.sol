pragma solidity ^0.5.16;

import "../../contracts/Comptroller.sol";
import "../../contracts/PriceOracle.sol";

contract ComptrollerKovan is Comptroller {
  function getXVSAddress() public view returns (address) {
    return 0x61460874a7196d6a22D1eE4922473664b3E95270;
  }
}

contract ComptrollerRopsten is Comptroller {
  function getXVSAddress() public view returns (address) {
    return 0x1Fe16De955718CFAb7A44605458AB023838C2793;
  }
}

contract ComptrollerHarness is Comptroller {
    address xvsAddress;
    address vaiAddress;
    uint public blockNumber;

    constructor() Comptroller() public {}

    function setPauseGuardian(address harnessedPauseGuardian) public {
        pauseGuardian = harnessedPauseGuardian;
    }

    function setVenusSupplyState(address vToken, uint224 index, uint32 blockNumber_) public {
        venusSupplyState[vToken].index = index;
        venusSupplyState[vToken].block = blockNumber_;
    }

    function setVenusBorrowState(address vToken, uint224 index, uint32 blockNumber_) public {
        venusBorrowState[vToken].index = index;
        venusBorrowState[vToken].block = blockNumber_;
    }

    function setVenusAccrued(address user, uint userAccrued) public {
        venusAccrued[user] = userAccrued;
    }

    function setXVSAddress(address xvsAddress_) public {
        xvsAddress = xvsAddress_;
    }

    function getXVSAddress() public view returns (address) {
        return xvsAddress;
    }

    function setVAIAddress(address vaiAddress_) public {
        vaiAddress = vaiAddress_;
    }

    function getVAIAddress() public view returns (address) {
        return vaiAddress;
    }

    function setVenusSpeed(address vToken, uint venusSpeed) public {
        venusSpeeds[vToken] = venusSpeed;
    }

    function setVenusBorrowerIndex(address vToken, address borrower, uint index) public {
        venusBorrowerIndex[vToken][borrower] = index;
    }

    function setVenusSupplierIndex(address vToken, address supplier, uint index) public {
        venusSupplierIndex[vToken][supplier] = index;
    }

    function harnessUpdateVenusBorrowIndex(address vToken, uint marketBorrowIndexMantissa) public {
        updateVenusBorrowIndex(vToken, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessUpdateVenusSupplyIndex(address vToken) public {
        updateVenusSupplyIndex(vToken);
    }

    function harnessDistributeBorrowerVenus(address vToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerVenus(vToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}), false);
    }

    function harnessDistributeSupplierVenus(address vToken, address supplier) public {
        distributeSupplierVenus(vToken, supplier, false);
    }

    function harnessTransferComp(address user, uint userAccrued, uint threshold) public returns (uint) {
        return transferXVS(user, userAccrued, threshold);
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getVenusMarkets() public view returns (address[] memory) {
        uint m = allMarkets.length;
        uint n = 0;
        for (uint i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isVenus) {
                n++;
            }
        }

        address[] memory venusMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isVenus) {
                venusMarkets[k++] = address(allMarkets[i]);
            }
        }
        return venusMarkets;
    }
}

contract ComptrollerBorked {
    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        unitroller._acceptImplementation();
    }
}

contract BoolComptroller is ComptrollerInterface {
    bool allowMint = true;
    bool allowRedeem = true;
    bool allowRepayVAI = true;
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyRepayVAI = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;

    bool allowMintVAI = true;
    bool allowBurnVAI = true;

    bool failCalculateSeizeTokens;
    uint calculatedSeizeTokens;

    uint noError = 0;
    uint opaqueError = noError + 11; // an arbitrary, opaque error code

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata _vTokens) external returns (uint[] memory) {
        _vTokens;
        uint[] memory ret;
        return ret;
    }

    function exitMarket(address _vToken) external returns (uint) {
        _vToken;
        return noError;
    }

    /*** Policy Hooks ***/

    function mintAllowed(address _vToken, address _minter, uint _mintAmount) public returns (uint) {
        _vToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(address _vToken, address _minter, uint _mintAmount, uint _mintTokens) external {
        _vToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(address _vToken, address _redeemer, uint _redeemTokens) public returns (uint) {
        _vToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(address _vToken, address _redeemer, uint _redeemAmount, uint _redeemTokens) external {
        _vToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function repayVAIAllowed(address _vToken, address _repayer, uint _repayVAIAmount) public returns (uint) {
        _vToken;
        _repayer;
        _repayVAIAmount;
        return allowRepayVAI ? noError : opaqueError;
    }

    function repayVAIVerify(address _vToken, address _repayer, uint _repayVAIAmount) external {
        _vToken;
        _repayer;
        _repayVAIAmount;
        require(verifyRepayVAI, "repayVAIVerify rejected repay VAI");
    }

    function borrowAllowed(address _vToken, address _borrower, uint _borrowAmount) public returns (uint) {
        _vToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(address _vToken, address _borrower, uint _borrowAmount) external {
        _vToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _vToken,
        address _payer,
        address _borrower,
        uint _repayAmount) public returns (uint) {
        _vToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _vToken,
        address _payer,
        address _borrower,
        uint _repayAmount,
        uint _borrowerIndex) external {
        _vToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function liquidateBorrowAllowed(
        address _vTokenBorrowed,
        address _vTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount) public returns (uint) {
        _vTokenBorrowed;
        _vTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _vTokenBorrowed,
        address _vTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount,
        uint _seizeTokens) external {
        _vTokenBorrowed;
        _vTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _vTokenCollateral,
        address _vTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint _seizeTokens) public returns (uint) {
        _vTokenCollateral;
        _vTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _vTokenCollateral,
        address _vTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint _seizeTokens) external {
        _vTokenCollateral;
        _vTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _vToken,
        address _src,
        address _dst,
        uint _transferTokens) public returns (uint) {
        _vToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _vToken,
        address _src,
        address _dst,
        uint _transferTokens) external {
        _vToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    /*** Special Liquidation Calculation ***/

    function liquidateCalculateSeizeTokens(
        address _vTokenBorrowed,
        address _vTokenCollateral,
        uint _repayAmount) public view returns (uint, uint) {
        _vTokenBorrowed;
        _vTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    /**** Mock Settors ****/

    /*** Policy Hooks ***/

    function setMintAllowed(bool allowMint_) public {
        allowMint = allowMint_;
    }

    function setMintVerify(bool verifyMint_) public {
        verifyMint = verifyMint_;
    }

    function setRedeemAllowed(bool allowRedeem_) public {
        allowRedeem = allowRedeem_;
    }

    function setRedeemVerify(bool verifyRedeem_) public {
        verifyRedeem = verifyRedeem_;
    }

    function setRepayVAIAllowed(bool allowRepayVAI_) public {
        allowRepayVAI = allowRepayVAI_;
    }

    function setRepayVAIVerify(bool verifyRepayVAI_) public {
        verifyRepayVAI = verifyRepayVAI_;
    }

    function setBorrowAllowed(bool allowBorrow_) public {
        allowBorrow = allowBorrow_;
    }

    function setBorrowVerify(bool verifyBorrow_) public {
        verifyBorrow = verifyBorrow_;
    }

    function setRepayBorrowAllowed(bool allowRepayBorrow_) public {
        allowRepayBorrow = allowRepayBorrow_;
    }

    function setRepayBorrowVerify(bool verifyRepayBorrow_) public {
        verifyRepayBorrow = verifyRepayBorrow_;
    }

    function setLiquidateBorrowAllowed(bool allowLiquidateBorrow_) public {
        allowLiquidateBorrow = allowLiquidateBorrow_;
    }

    function setLiquidateBorrowVerify(bool verifyLiquidateBorrow_) public {
        verifyLiquidateBorrow = verifyLiquidateBorrow_;
    }

    function setSeizeAllowed(bool allowSeize_) public {
        allowSeize = allowSeize_;
    }

    function setSeizeVerify(bool verifySeize_) public {
        verifySeize = verifySeize_;
    }

    function setTransferAllowed(bool allowTransfer_) public {
        allowTransfer = allowTransfer_;
    }

    function setTransferVerify(bool verifyTransfer_) public {
        verifyTransfer = verifyTransfer_;
    }

    /*** Liquidity/Liquidation Calculations ***/

    function setCalculatedSeizeTokens(uint seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }

    function getUnderlyingPrice(address _vToken) external view returns (uint) {
        _vToken;
        return noError;
    }

    function mintVAI(
        address _vToken,
        address _usr,
        uint _wad) public returns (uint) {
        _vToken;
        _usr;
        _wad;
        return _wad;
    }

    function burnVAI(
        address _vToken,
        address _usr,
        uint _wad) public returns (uint) {
        _vToken;
        _usr;
        _wad;
        return _wad;
    }
}

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns(string memory) {
        return s;
    }

    function addresses(address a) public pure returns(address) {
        return a;
    }

    function booly(bool b) public pure returns(bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns(uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}
