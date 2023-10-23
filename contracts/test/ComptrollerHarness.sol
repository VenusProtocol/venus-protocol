pragma solidity ^0.5.16;

import "./ComptrollerMock.sol";
import "../Oracle/PriceOracle.sol";
import "../Comptroller/Unitroller.sol";

contract ComptrollerHarness is ComptrollerMock {
    address internal xvsAddress;
    address internal vXVSAddress;
    uint public blockNumber;

    constructor() public ComptrollerMock() {}

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

    function setXVSVTokenAddress(address vXVSAddress_) public {
        vXVSAddress = vXVSAddress_;
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
            Exp memory borrowIndex = Exp({ mantissa: vToken.borrowIndex() });
            updateVenusSupplyIndex(address(vToken));
            updateVenusBorrowIndex(address(vToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({ mantissa: 0 });
        Exp[] memory utilities = new Exp[](allMarkets_.length);
        for (uint i = 0; i < allMarkets_.length; i++) {
            VToken vToken = allMarkets_[i];
            if (venusSpeeds[address(vToken)] > 0) {
                Exp memory assetPrice = Exp({ mantissa: oracle.getUnderlyingPrice(vToken) });
                Exp memory utility = mul_(assetPrice, vToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (uint i = 0; i < allMarkets_.length; i++) {
            VToken vToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(venusRate, div_(utilities[i], totalUtility)) : 0;
            setVenusSpeedInternal(vToken, newSpeed, newSpeed);
        }
    }

    function setVenusBorrowerIndex(address vToken, address borrower, uint index) public {
        venusBorrowerIndex[vToken][borrower] = index;
    }

    function setVenusSupplierIndex(address vToken, address supplier, uint index) public {
        venusSupplierIndex[vToken][supplier] = index;
    }

    function harnessDistributeAllBorrowerVenus(
        address vToken,
        address borrower,
        uint marketBorrowIndexMantissa
    ) public {
        distributeBorrowerVenus(vToken, borrower, Exp({ mantissa: marketBorrowIndexMantissa }));
        venusAccrued[borrower] = grantXVSInternal(borrower, venusAccrued[borrower], 0, false);
    }

    function harnessDistributeAllSupplierVenus(address vToken, address supplier) public {
        distributeSupplierVenus(vToken, supplier);
        venusAccrued[supplier] = grantXVSInternal(supplier, venusAccrued[supplier], 0, false);
    }

    function harnessUpdateVenusBorrowIndex(address vToken, uint marketBorrowIndexMantissa) public {
        updateVenusBorrowIndex(vToken, Exp({ mantissa: marketBorrowIndexMantissa }));
    }

    function harnessUpdateVenusSupplyIndex(address vToken) public {
        updateVenusSupplyIndex(vToken);
    }

    function harnessDistributeBorrowerVenus(address vToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerVenus(vToken, borrower, Exp({ mantissa: marketBorrowIndexMantissa }));
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
            setVenusSpeedInternal(VToken(vTokens[i]), 1, 1);
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

    function getBlockNumber() internal view returns (uint) {
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

    function harnessAddVtoken(address vToken) external {
        markets[vToken] = Market({ isListed: true, isVenus: false, collateralFactorMantissa: 0 });
    }
}

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns (string memory) {
        return s;
    }

    function addresses(address a) public pure returns (address) {
        return a;
    }

    function booly(bool b) public pure returns (bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns (uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}
