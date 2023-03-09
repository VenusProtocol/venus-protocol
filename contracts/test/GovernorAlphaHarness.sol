pragma solidity 0.8.13;
pragma experimental ABIEncoderV2;

import "../Governance/GovernorAlpha.sol";

contract GovernorAlphaHarness is GovernorAlpha {
    constructor(address timelock_, address xvs_, address guardian_) public GovernorAlpha(timelock_, xvs_, guardian_) {}

    function votingPeriod() public override pure returns (uint) {
        return 240;
    }
}
