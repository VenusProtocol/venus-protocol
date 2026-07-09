// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

// Compilation anchor: forces Foundry to compile the 0.5.16 XVSVault graph into
// named artifacts so the 0.8 tests can instantiate them via `deployCode`.
// Importing XVSVaultScenario transitively pulls in XVSVault, XVSVaultStorage,
// TimeManagerV5, AccessControlledV5, SafeMath, etc. Nothing here is deployed
// directly; it exists only to seed the artifact set.
import "../../contracts/test/XVSVaultScenario.sol";
import "../../contracts/XVSVault/XVSStore.sol";
