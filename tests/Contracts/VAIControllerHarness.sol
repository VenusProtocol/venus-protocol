pragma solidity ^0.5.16;

import "../../contracts/VAIController.sol";

contract VAIControllerHarness is VAIController {
    address vaiAddress;
    uint public blockNumber;

    constructor() VAIController() public {}

    function setVenusVAIState(uint224 index, uint32 blockNumber_) public {
        venusVAIState.index = index;
        venusVAIState.block = blockNumber_;
    }

    function setVAIAddress(address vaiAddress_) public {
        vaiAddress = vaiAddress_;
    }

    function getVAIAddress() public view returns (address) {
        return vaiAddress;
    }

    function setVenusVAIMinterIndex(address vaiMinter, uint index) public {
        venusVAIMinterIndex[vaiMinter] = index;
    }

    function harnessUpdateVenusVAIMintIndex() public {
        updateVenusVAIMintIndex();
    }

    function harnessCalcDistributeVAIMinterVenus(address vaiMinter) public {
        calcDistributeVAIMinterVenus(vaiMinter);
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
}
