// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

contract AccessControlManagerMock {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function isAllowedToCall(address account, string calldata functionSig) public view returns (bool) {
        if (account == owner) {
            return true;
        }

        functionSig;

        return false;
    }
}
