pragma solidity ^0.5.16;

import "../../contracts/VRTVault/VRTVault.sol";

contract VRTVaultHarness is VRTVault {

    uint public blockNumber;

    constructor() VRTVault() public {}

    function overrideInterestRatePerBlock(uint256 _interestRatePerBlock) public {
        interestRatePerBlock = _interestRatePerBlock;
    }

    function balanceOfUser() public view returns (uint256, address) {
        uint256 vrtBalanceOfUser = vrt.balanceOf(msg.sender);
        return (vrtBalanceOfUser, msg.sender);
    }

    function harnessFastForward(uint256 blocks) public returns (uint256) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint256 number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint256) {
        return blockNumber;
    }
}
