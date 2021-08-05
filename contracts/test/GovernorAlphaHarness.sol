// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../Governance/GovernorAlpha.sol";

contract GovernorAlphaHarness is GovernorAlpha {
    constructor(address timelock_, address xvs_, address guardian_) GovernorAlpha(timelock_, xvs_, guardian_) public {}

    function votingPeriod() public pure returns (uint) { return 240; }
}
