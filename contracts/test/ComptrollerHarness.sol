pragma solidity ^0.5.16;

import "../Comptroller.sol";
import "../PriceOracle.sol";

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
    address vXVSAddress;
    uint public blockNumber;

    constructor() Comptroller() public {}

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

    function setXVSVTokenAddress(address vXVSAddress_) public {
        vXVSAddress = vXVSAddress_;
    }

    function getXVSVTokenAddress() public view returns (address) {
        return vXVSAddress;
    }

    /**
     * @notice Set the amount of XVS distributed per block
     * @param venusRate_ The amount of XVS wei per block to distribute
     */
    function harnessSetVenusRate(uint venusRate_) public {
        venusRate = venusRate_;
    }

    /**
     * @notice Recalculate and update XVS speeds for all XVS markets
     */
    function harnessRefreshVenusSpeeds() public {
        VToken[] memory allMarkets_ = allMarkets;

        for (uint i = 0; i < allMarkets_.length; i++) {
            VToken vToken = allMarkets_[i];
            Exp memory borrowIndex = Exp({mantissa: vToken.borrowIndex()});
            updateVenusSupplyIndex(address(vToken));
            updateVenusBorrowIndex(address(vToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({mantissa: 0});
        Exp[] memory utilities = new Exp[](allMarkets_.length);
        for (uint i = 0; i < allMarkets_.length; i++) {
            VToken vToken = allMarkets_[i];
            if (venusSpeeds[address(vToken)] > 0) {
                Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(vToken)});
                Exp memory utility = mul_(assetPrice, vToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (uint i = 0; i < allMarkets_.length; i++) {
            VToken vToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(venusRate, div_(utilities[i], totalUtility)) : 0;
            setVenusSpeedInternal(vToken, newSpeed);
        }
    }

    function setVenusBorrowerIndex(address vToken, address borrower, uint index) public {
        venusBorrowerIndex[vToken][borrower] = index;
    }

    function setVenusSupplierIndex(address vToken, address supplier, uint index) public {
        venusSupplierIndex[vToken][supplier] = index;
    }

    function harnessDistributeAllBorrowerVenus(address vToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerVenus(vToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
        venusAccrued[borrower] = grantXVSInternal(borrower, venusAccrued[borrower], 0, false);
    }

    function harnessDistributeAllSupplierVenus(address vToken, address supplier) public {
        distributeSupplierVenus(vToken, supplier);
        venusAccrued[supplier] = grantXVSInternal(supplier, venusAccrued[supplier], 0, false);
    }

    function harnessUpdateVenusBorrowIndex(address vToken, uint marketBorrowIndexMantissa) public {
        updateVenusBorrowIndex(vToken, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessUpdateVenusSupplyIndex(address vToken) public {
        updateVenusSupplyIndex(vToken);
    }

    function harnessDistributeBorrowerVenus(address vToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerVenus(vToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessDistributeSupplierVenus(address vToken, address supplier) public {
        distributeSupplierVenus(vToken, supplier);
    }

    function harnessTransferVenus(address user, uint userAccrued, uint threshold) public returns (uint) {
        if (userAccrued > 0 && userAccrued >= threshold) {
            return grantXVSInternal(user, userAccrued, 0, false);
        }
        return userAccrued;
    }

    function harnessAddVenusMarkets(address[] memory vTokens) public {
        for (uint i = 0; i < vTokens.length; i++) {
            // temporarily set venusSpeed to 1 (will be fixed by `harnessRefreshVenusSpeeds`)
            setVenusSpeedInternal(VToken(vTokens[i]), 1);
        }
    }

    function harnessSetMintedVAIs(address user, uint amount) public {
        mintedVAIs[user] = amount;
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
            if (venusSpeeds[address(allMarkets[i])] > 0) {
                n++;
            }
        }

        address[] memory venusMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (venusSpeeds[address(allMarkets[i])] > 0) {
                venusMarkets[k++] = address(allMarkets[i]);
            }
        }
        return venusMarkets;
    }

    function harnessSetReleaseStartBlock(uint startBlock) external {
        releaseStartBlock = startBlock;
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
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;
    uint public liquidationIncentiveMantissa = 11e17;
    bool failCalculateSeizeTokens;
    uint calculatedSeizeTokens;

    bool public protocolPaused = false;

    mapping(address => uint) public mintedVAIs;
    bool vaiFailCalculateSeizeTokens;
    uint vaiCalculatedSeizeTokens;

    uint noError = 0;
    uint opaqueError = noError + 11; // an arbitrary, opaque error code

    address public treasuryGuardian;
    address public treasuryAddress;
    uint public treasuryPercent;
    address public liquidatorContract;

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

    function mintAllowed(address _vToken, address _minter, uint _mintAmount) external returns (uint) {
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

    function redeemAllowed(address _vToken, address _redeemer, uint _redeemTokens) external returns (uint) {
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

    function borrowAllowed(address _vToken, address _borrower, uint _borrowAmount) external returns (uint) {
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
        uint _repayAmount) external returns (uint) {
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

    function _setLiquidatorContract(address liquidatorContract_) external {
        liquidatorContract = liquidatorContract_;
    }

    function liquidateBorrowAllowed(
        address _vTokenBorrowed,
        address _vTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount) external returns (uint) {
        _vTokenBorrowed;
        _vTokenCollateral;
        _borrower;
        _repayAmount;
        if (liquidatorContract != address(0) && liquidatorContract != _liquidator) {
            return opaqueError;
        }
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
        uint _seizeTokens) external returns (uint) {
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
        uint _transferTokens) external returns (uint) {
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
        uint _repayAmount) external view returns (uint, uint) {
        _vTokenBorrowed;
        _vTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    /*** Special Liquidation Calculation ***/

    function liquidateVAICalculateSeizeTokens(
        address _vTokenCollateral,
        uint _repayAmount) external view returns (uint, uint) {
        _vTokenCollateral;
        _repayAmount;
        return vaiFailCalculateSeizeTokens ? (opaqueError, 0) : (noError, vaiCalculatedSeizeTokens);
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
    function setAnnouncedLiquidationIncentiveMantissa(uint mantissa_) external {
        liquidationIncentiveMantissa = mantissa_;
    }

    /*** Liquidity/Liquidation Calculations ***/

    function setCalculatedSeizeTokens(uint seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }

    function setVAICalculatedSeizeTokens(uint vaiSeizeTokens_) public {
        vaiCalculatedSeizeTokens = vaiSeizeTokens_;
    }

    function setVAIFailCalculateSeizeTokens(bool vaiShouldFail) public {
        vaiFailCalculateSeizeTokens = vaiShouldFail;
    }

    function harnessSetMintedVAIOf(address owner, uint amount) external returns (uint) {
        mintedVAIs[owner] = amount;
        return noError;
    }

    // function mintedVAIs(address owner) external pure returns (uint) {
    //     owner;
    //     return 1e18;
    // }

    function setMintedVAIOf(address owner, uint amount) external returns (uint) {
        owner;
        amount;
        return noError;
    }

    function vaiMintRate() external pure returns (uint) {
        return 1e18;
    }

    function setTreasuryData(address treasuryGuardian_, address treasuryAddress_, uint treasuryPercent_) external {
        treasuryGuardian = treasuryGuardian_;
        treasuryAddress = treasuryAddress_;
        treasuryPercent = treasuryPercent_;
    }

    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint[] calldata newSupplyCaps) external {

    }

    /*** Functions from ComptrollerInterface not implemented by BoolComptroller ***/

    function markets(address) external view returns (bool, uint) { revert(); }
    function oracle() external view returns (PriceOracle) { revert(); }
    function getAccountLiquidity(address) external view returns (uint, uint, uint) { revert(); }
    function getAssetsIn(address) external view returns (VToken[] memory) { revert(); }
    function claimVenus(address) external { revert(); }
    function venusAccrued(address) external view returns (uint) { revert(); }
    function venusSpeeds(address) external view returns (uint) { revert(); }
    function getAllMarkets() external view returns (VToken[] memory) { revert(); }
    function venusSupplierIndex(address, address) external view returns (uint) { revert(); }
    function venusInitialIndex() external view returns (uint224) { revert(); }
    function venusBorrowerIndex(address, address) external view returns (uint) { revert(); }
    function venusBorrowState(address) external view returns (uint224, uint32) { revert(); }
    function venusSupplyState(address) external view returns (uint224, uint32) { revert(); }
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
