pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../../contracts/Governance/GovernorBravoDelegate.sol";
import "./XVSVaultHarness.sol";

contract GovernorBravoDelegateHarness is GovernorBravoDelegate {
	// @notice Harness initiate the GovenorBravo contract
	// @dev This function bypasses the need to initiate the GovernorBravo contract from an existing GovernorAlpha for testing.
	// Actual use will only use the _initiate(address) function
    function _initiate() public {
        proposalCount = 1;
        initialProposalId = 1;
    }

    function initialize(
        address timelock_,
        address xvsVault_,
        uint votingPeriod_,
        uint votingDelay_,
        uint proposalThreshold_,
        address guardian_
    ) public {
        require(msg.sender == admin, "GovernorBravo::initialize: admin only");
        require(address(timelock) == address(0), "GovernorBravo::initialize: can only initialize once");

        timelock = TimelockInterface(timelock_);
        xvsVault = XvsVaultInterface(xvsVault_);
        votingPeriod = votingPeriod_;
        votingDelay = votingDelay_;
        proposalThreshold = proposalThreshold_;
        proposalMaxOperations = 10;
        guardian = guardian_;
    }
}
