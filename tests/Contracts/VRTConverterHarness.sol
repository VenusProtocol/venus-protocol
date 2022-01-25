pragma solidity ^0.5.16;

import "../../contracts/VRT/VRTConverter.sol";

contract VRTConverterHarness is VRTConverter {
    constructor(
        address _vrtAddress,
        address _xvsAddress,
        address _xvsVestingAddress,
        uint256 _conversionRatio,
        uint256 _conversionStartTime,
        uint256 _vrtTotalSupply
    )
        public
        VRTConverter(
            _vrtAddress,
            _xvsAddress,
            _xvsVestingAddress,
            _conversionRatio,
            _conversionStartTime,
            _vrtTotalSupply
        )
    {}

    function balanceOfUser() public view returns (uint256, address) {
        uint256 vrtBalanceOfUser = vrt.balanceOf(msg.sender);
        return (vrtBalanceOfUser, msg.sender);
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
