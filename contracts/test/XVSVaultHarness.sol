pragma solidity 0.8.13;

contract XVSVaultHarness {
    constructor() public {}

    // solhint-disable-next-line no-unused-vars
    function getPriorVotes(address account, uint256 blockNumber, uint256 votePower) external view returns (uint256) {
        return votePower;
    }
}
