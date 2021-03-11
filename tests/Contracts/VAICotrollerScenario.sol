pragma solidity ^0.5.16;

import "../../contracts/VAIController.sol";

contract VAIControllerScenario is VAIController {
    uint public blockNumber;
    address public xvsAddress;
    address public vaiAddress;

    constructor() VAIController() public {}

    function setVAIAddress(address vaiAddress_) public {
        vaiAddress = vaiAddress_;
    }

    function getVAIAddress() public view returns (address) {
        return vaiAddress;
    }
}
