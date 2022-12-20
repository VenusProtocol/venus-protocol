pragma solidity ^0.5.16;

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

    function getVAIAddress() public view returns (address) {
        return vaiAddress;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }
}
