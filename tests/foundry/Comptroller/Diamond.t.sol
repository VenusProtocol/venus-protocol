// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ProtocolBase } from "../ProtocolBase.t.sol";

/// @notice That the assembled diamond is wired the way the deployment wires it.
contract DiamondTest is ProtocolBase {
    function setUp() public {
        _deployComptroller();
    }

    function test_callsRouteThroughToTheFacets() public view {
        assertEq(unitroller.comptrollerImplementation(), address(diamond));
        assertTrue(comptroller.isComptroller());
        assertEq(comptroller.getAllMarkets().length, 0);
        assertEq(address(comptroller.comptrollerLens()), address(comptrollerLens));
    }
}
