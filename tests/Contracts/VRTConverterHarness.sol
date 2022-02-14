pragma solidity ^0.5.16;

import "../../contracts/VRT/VRTConverter.sol";

contract VRTConverterHarness is VRTConverter {
    constructor(
        address _vrtAddress,
        uint256 _conversionRatio,
        uint256 _vrtTotalSupply
    )
        public
        VRTConverter(
            _vrtAddress,
            _conversionRatio,
            _vrtTotalSupply
        )
    {}

    function balanceOfUser() public view returns (uint256, address) {
        uint256 vrtBalanceOfUser = vrt.balanceOf(msg.sender);
        return (vrtBalanceOfUser, msg.sender);
    }
}
