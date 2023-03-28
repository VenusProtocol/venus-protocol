pragma solidity ^0.5.16;

import "../Governance/Timelock.sol";

interface Administered {
    function _acceptAdmin() external returns (uint);
}

contract TimelockHarness is Timelock {
    constructor(address admin_, uint delay_) public Timelock(admin_, delay_) {}

    function harnessSetPendingAdmin(address pendingAdmin_) public {
        pendingAdmin = pendingAdmin_;
    }

    function harnessSetAdmin(address admin_) public {
        admin = admin_;
    }
}

contract TimelockTest is Timelock {
    constructor(address admin_, uint delay_) public Timelock(admin_, 2 days) {
        delay = delay_;
    }

    function harnessSetAdmin(address admin_) public {
        require(msg.sender == admin, "owner check");
        admin = admin_;
    }

    function harnessAcceptAdmin(Administered administered) public {
        administered._acceptAdmin();
    }
}
