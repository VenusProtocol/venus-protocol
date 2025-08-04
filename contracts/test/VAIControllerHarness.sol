// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import "../Tokens/VAI/VAIController.sol";

contract VAIControllerHarness is VAIController {
    uint public blockNumber;
    uint public blocksPerYear;

    constructor() VAIController() {
        admin = msg.sender;
    }

    function setVenusVAIState(uint224 index, uint32 blockNumber_) public {
        venusVAIState.index = index;
        venusVAIState.block = blockNumber_;
    }

    function setVAIAddress(address vaiAddress_) public {
        vai = vaiAddress_;
    }

    function getVAIAddress() public view override returns (address) {
        return vai;
    }

    function harnessRepayVAIFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err, ) = repayVAIFresh(payer, account, repayAmount);
        return err;
    }

    function harnessLiquidateVAIFresh(
        address liquidator,
        address borrower,
        uint repayAmount,
        IVToken vTokenCollateral
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

    function getBlockNumber() internal view override returns (uint) {
        return blockNumber;
    }

    function getBlocksPerYear() public view override returns (uint) {
        return blocksPerYear;
    }
}
