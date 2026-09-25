// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VTokenBase, VTokenHandler } from "./VTokenBase.t.sol";

/// @notice Properties that must hold after any sequence of supplies, withdrawals, borrows, repays
///  and elapsed blocks. Foundry drives the handler; nothing here assumes an order.
contract VTokenInvariantsTest is VTokenBase {
    VTokenHandler internal handler;

    function setUp() public {
        _deployMarket();

        address[] memory actors = new address[](4);
        actors[0] = makeAddr("alice");
        actors[1] = makeAddr("bob");
        actors[2] = makeAddr("carol");
        actors[3] = makeAddr("dave");

        address[] memory markets = new address[](1);
        markets[0] = address(vToken);
        for (uint256 i; i < actors.length; ++i) {
            vm.prank(actors[i]);
            comptroller.enterMarkets(markets);
        }

        handler = new VTokenHandler(vToken, underlying, actors);
        targetContract(address(handler));
    }

    /// @notice The market's idea of its own cash must match the tokens it actually holds. A gap
    ///  either way means a path that moved one without the other.
    function invariant_cashMatchesTheTokenBalance() public view {
        assertEq(vToken.getCash(), underlying.balanceOf(address(vToken)));
    }

    /// @notice The exchange rate is a ratchet. Interest and rounding push it up; no user action
    ///  may push it down, because that would take value from the suppliers already in.
    function invariant_exchangeRateNeverFalls() public view {
        assertGe(vToken.exchangeRateStored(), handler.ghostExchangeRate());
    }

    /// @notice The pool is solvent: what it holds plus what it is owed covers what it has promised
    ///  its suppliers, after setting aside the reserves.
    function invariant_marketIsSolvent() public view {
        uint256 supplied = (vToken.totalSupply() * vToken.exchangeRateStored()) / 1e18;
        uint256 assets = vToken.getCash() + vToken.totalBorrows();

        assertGe(assets, supplied + vToken.totalReserves());
    }
}
