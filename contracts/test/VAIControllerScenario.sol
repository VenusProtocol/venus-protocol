pragma solidity 0.8.13;

import "../Tokens/VAI/VAIController.sol";
import "./ComptrollerScenario.sol";

contract VAIControllerScenario is VAIController {
    uint internal blockNumber;
    address public xvsAddress;
    address public vaiAddress;

    constructor() public VAIController() {}

    function setVAIAddress(address vaiAddress_) public {
        vaiAddress = vaiAddress_;
    }

    function getVAIAddress() public view override returns (address) {
        return vaiAddress;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view override returns (uint) {
        return blockNumber;
    }
}
