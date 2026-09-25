// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { CommonBase } from "forge-std/Base.sol";
import { StdCheats } from "forge-std/StdCheats.sol";
import { StdUtils } from "forge-std/StdUtils.sol";

import { VBep20Immutable } from "../../../contracts/Tokens/VTokens/VBep20Immutable.sol";
import { MockToken } from "../../../contracts/test/MockToken.sol";
import { ProtocolBase } from "../ProtocolBase.t.sol";

/// @notice What the VToken suites share on top of the common deployment.
abstract contract VTokenBase is ProtocolBase {
    /// @dev Funds `who`, enters the market on their behalf and mints `amount` of underlying.
    function _mintAs(address who, uint256 amount) internal {
        deal(address(underlying), who, amount);

        address[] memory markets = new address[](1);
        markets[0] = address(vToken);

        vm.startPrank(who);
        comptroller.enterMarkets(markets);
        underlying.approve(address(vToken), amount);
        vToken.mint(amount);
        vm.stopPrank();
    }
}

contract VTokenHandler is CommonBase, StdCheats, StdUtils {
    VBep20Immutable public immutable vToken;
    MockToken public immutable underlying;

    address[] public actors;

    /// @dev Ghost state: the rate as of the last call, which the vToken does not keep.
    uint256 public ghostExchangeRate;

    uint256 internal constant MAX_ACTION = 1e24;

    constructor(VBep20Immutable vToken_, MockToken underlying_, address[] memory actors_) {
        vToken = vToken_;
        underlying = underlying_;
        actors = actors_;
        ghostExchangeRate = vToken_.exchangeRateStored();
    }

    modifier recordsExchangeRate() {
        _;
        ghostExchangeRate = vToken.exchangeRateStored();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function mint(uint256 actorSeed, uint256 amount) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        amount = bound(amount, 1e12, MAX_ACTION);

        deal(address(underlying), actor, underlying.balanceOf(actor) + amount);

        vm.startPrank(actor);
        underlying.approve(address(vToken), amount);
        vToken.mint(amount);
        vm.stopPrank();
    }

    function redeem(uint256 actorSeed, uint256 shares) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        uint256 balance = vToken.balanceOf(actor);
        if (balance == 0) return;
        shares = bound(shares, 1, balance);

        vm.prank(actor);
        vToken.redeem(shares);
    }

    function borrow(uint256 actorSeed, uint256 amount) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        uint256 cash = vToken.getCash();
        if (cash == 0) return;
        amount = bound(amount, 1, cash);

        vm.prank(actor);
        vToken.borrow(amount);
    }

    function repay(uint256 actorSeed, uint256 amount) external recordsExchangeRate {
        address actor = _actor(actorSeed);
        uint256 debt = vToken.borrowBalanceStored(actor);
        if (debt == 0) return;
        amount = bound(amount, 1, debt);

        deal(address(underlying), actor, underlying.balanceOf(actor) + amount);

        vm.startPrank(actor);
        underlying.approve(address(vToken), amount);
        vToken.repayBorrow(amount);
        vm.stopPrank();
    }

    /// @dev VToken accrues per block, so time only moves when blocks do.
    function passBlocks(uint256 count) external recordsExchangeRate {
        vm.roll(block.number + bound(count, 1, 100_000));
        vToken.accrueInterest();
    }
}
