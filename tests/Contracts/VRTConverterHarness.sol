pragma solidity ^0.5.16;

import "../../contracts/VRT/VRTConverter.sol";

contract VRTConverterHarness is VRTConverter {
    
    constructor() VRTConverter() public {
        admin = msg.sender;
    }

    function balanceOfUser() public view returns (uint256, address) {
        uint256 vrtBalanceOfUser = vrt.balanceOf(msg.sender);
        return (vrtBalanceOfUser, msg.sender);
    }

    function setConversionRatio(uint256 _conversionRatio) public onlyAdmin {
        conversionRatio = _conversionRatio;
    }

    function setConversionTimeline(uint256 _conversionStartTime, uint256 _conversionPeriod) public onlyAdmin {
        conversionStartTime = _conversionStartTime;
        conversionPeriod = _conversionPeriod;
        conversionEndTime = conversionStartTime.add(conversionPeriod);
    }

    function getXVSRedeemedAmount(uint256 vrtAmount)
    public
    view
    returns (uint256)
    {
        return
            vrtAmount
                .mul(conversionRatio)
                .mul(xvsDecimalsMultiplier)
                .div(1e18)
                .div(vrtDecimalsMultiplier);
    }
}
