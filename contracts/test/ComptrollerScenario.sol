pragma solidity ^0.5.16;

import "../Comptroller.sol";

contract ComptrollerScenario is Comptroller {
    uint public blockNumber;
    address public xvsAddress;
    address public vaiAddress;

    constructor() Comptroller() public {}

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

    function membershipLength(VToken vToken) public view returns (uint) {
        return accountAssets[address(vToken)].length;
    }

    function fastForward(uint blocks) public returns (uint) {
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

    function unlist(VToken vToken) public {
        markets[address(vToken)].isListed = false;
    }

    /**
     * @notice Recalculate and update XVS speeds for all XVS markets
     */
    function refreshVenusSpeeds() public {
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
}
