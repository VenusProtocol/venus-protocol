pragma solidity ^0.5.16;

contract XVSVaultHarness {
    constructor() public {}

    function getPriorVotes(address account, uint256 blockNumber, uint256 votePower) external view returns (uint256) {
        return votePower;
    }
}
