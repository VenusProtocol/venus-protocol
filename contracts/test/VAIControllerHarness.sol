pragma solidity ^0.5.16;

import "../Tokens/VAI/VAIController.sol";

contract VAIControllerHarness is VAIController {
    address internal vaiAddress;
    uint public blockNumber;
    uint public blocksPerYear;

    constructor() public VAIController() {
        admin = msg.sender;
    }

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

    function harnessRepayVAIFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayVAIFresh(payer, account, repayAmount);
        return err;
    }

    function harnessLiquidateVAIFresh(
        address liquidator,
        address borrower,
        uint repayAmount,
        VToken vTokenCollateral
    ) public returns (uint) {
        (uint err, ) = liquidateVAIFresh(liquidator, borrower, repayAmount, vTokenCollateral);
        return err;
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function setBlocksPerYear(uint number) public {
        blocksPerYear = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getBlocksPerYear() public view returns (uint) {
        return blocksPerYear;
    }
}
