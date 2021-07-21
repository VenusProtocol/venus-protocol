pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../contracts/Governance/GovernorBravoDelegate.sol";

contract GovernorBravoImmutable is GovernorBravoDelegate {

     constructor(
            address timelock_,
            address xvs_,
            address admin_,
            uint votingPeriod_,
            uint votingDelay_,
            uint proposalThreshold_) public {
        admin = msg.sender;
        initialize(timelock_, xvs_, votingPeriod_, votingDelay_, proposalThreshold_);

        admin = admin_;
    }


    function initialize(address timelock_, address xvs_, uint votingPeriod_, uint votingDelay_, uint proposalThreshold_) public {
        require(msg.sender == admin, "GovernorBravo::initialize: admin only");
        require(address(timelock) == address(0), "GovernorBravo::initialize: can only initialize once");

        timelock = TimelockInterface(timelock_);
        xvs = XvsInterface(xvs_);
        votingPeriod = votingPeriod_;
        votingDelay = votingDelay_;
        proposalThreshold = proposalThreshold_;
        proposalMaxOperations = 10;
    }

    function _initiate() public {
        proposalCount = 1;
        initialProposalId = 1;
    }
}
