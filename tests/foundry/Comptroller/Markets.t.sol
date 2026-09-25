// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VToken } from "../../../contracts/Tokens/VTokens/VToken.sol";
import { ComptrollerErrorReporter } from "../../../contracts/Utils/ErrorReporter.sol";
import { ProtocolBase } from "../ProtocolBase.t.sol";

/// @notice Listing a market and the bounds the Comptroller puts on its risk parameters.
contract MarketsTest is ProtocolBase {
    address internal alice = makeAddr("alice");

    function setUp() public {
        _deployMarket();
    }

    function test_marketIsListedWithItsRiskParameters() public view {
        assertTrue(comptroller.isMarketListed(VToken(address(vToken))));
        assertEq(comptroller.getCollateralFactor(address(vToken)), COLLATERAL_FACTOR);
        assertEq(comptroller.getLiquidationThreshold(address(vToken)), LIQUIDATION_THRESHOLD);
    }

    function test_enterAndExitMarket() public {
        address[] memory markets = new address[](1);
        markets[0] = address(vToken);

        vm.prank(alice);
        comptroller.enterMarkets(markets);
        assertTrue(comptroller.checkMembership(alice, VToken(address(vToken))));

        vm.prank(alice);
        comptroller.exitMarket(address(vToken));
        assertFalse(comptroller.checkMembership(alice, VToken(address(vToken))));
    }

    function test_settingCollateralFactorIsGatedOnAccessControl() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert();
        comptroller.setCollateralFactor(VToken(address(vToken)), 0.5e18, 0.6e18);
    }

    /// @notice Any collateral factor at or below its liquidation threshold is stored exactly.
    function testFuzz_validRiskParametersRoundTrip(uint256 cf, uint256 lt) public {
        lt = bound(lt, 1, 1e18);
        cf = bound(cf, 0, lt);

        comptroller.setCollateralFactor(VToken(address(vToken)), cf, lt);

        assertEq(comptroller.getCollateralFactor(address(vToken)), cf);
        assertEq(comptroller.getLiquidationThreshold(address(vToken)), lt);
    }

    /// @notice A collateral factor above its liquidation threshold would let an account borrow
    ///  past the point where it can be liquidated, so it must never take effect.
    /// @dev The Comptroller follows the Compound convention of returning an error code rather than
    ///  reverting, so the assertion is on the return value and on the state being left alone.
    function testFuzz_collateralFactorAboveThresholdIsRejected(uint256 cf, uint256 lt) public {
        lt = bound(lt, 0, 1e18 - 1);
        cf = bound(cf, lt + 1, 1e18);

        uint256 previous = comptroller.getCollateralFactor(address(vToken));

        uint256 err = comptroller.setCollateralFactor(VToken(address(vToken)), cf, lt);

        assertEq(err, uint256(ComptrollerErrorReporter.Error.INVALID_LIQUIDATION_THRESHOLD));
        assertEq(comptroller.getCollateralFactor(address(vToken)), previous);
    }
}
