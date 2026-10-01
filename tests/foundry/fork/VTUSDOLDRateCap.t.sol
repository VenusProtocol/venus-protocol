// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Test, console2 } from "forge-std/Test.sol";

interface IVTokenLike {
    function accrueInterest() external returns (uint256);
    function repayBorrow(uint256 repayAmount) external returns (uint256);
    function _setInterestRateModel(address newInterestRateModel) external returns (uint256);
    function totalBorrows() external view returns (uint256);
    function totalReserves() external view returns (uint256);
    function reserveFactorMantissa() external view returns (uint256);
    function interestRateModel() external view returns (address);
}

interface IInterestRateModelLike {
    function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) external view returns (uint256);
}

/// @notice vTUSDOLD on BSC mainnet: zero cash and a 100% reserve factor keep borrows minus reserves
///  constant, so utilization and the borrow rate climb with the debt until accrueInterest reverts on
///  the VToken's borrow rate cap. Past that point every call that accrues interest reverts, including
///  the governance call that would swap the rate model.
/// @dev Needs ARCHIVE_NODE_bscmainnet. Without it every test is skipped.
contract VTUSDOLDRateCapForkTest is Test {
    IVTokenLike internal constant VTUSDOLD = IVTokenLike(0x08CEB3F4a7ed3500cA0982bcd0FC7816688084c3);
    address internal constant NORMAL_TIMELOCK = 0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396;
    address internal constant FAST_TRACK_TIMELOCK = 0x555ba73dB1b006F3f2C7dB7126d6e4343aDBce02;

    uint256 internal constant FORK_BLOCK = 125_064_000; // 1 Oct 2026, about 08:00 UTC
    uint256 internal constant BLOCKS_PER_DAY = 192_000;
    uint256 internal constant STEP = 20_000;

    // Same value as borrowRateMaxMantissa in VTokenInterfaces.sol.
    uint256 internal constant BORROW_RATE_MAX = 0.0005e16;

    function setUp() public {
        if (bytes(vm.envOr("ARCHIVE_NODE_bscmainnet", string(""))).length == 0) {
            vm.skip(true);
        }
        vm.createSelectFork("bscmainnet", FORK_BLOCK);
    }

    function _rate() internal view returns (uint256) {
        return
            IInterestRateModelLike(VTUSDOLD.interestRateModel()).getBorrowRate(
                0,
                VTUSDOLD.totalBorrows(),
                VTUSDOLD.totalReserves()
            );
    }

    /// @dev Rolls forward STEP blocks at a time and accrues, until the rate model returns a rate
    ///  above the cap. Returns the number of blocks rolled.
    function _rollUntilCapped() internal returns (uint256 rolled) {
        while (_rate() <= BORROW_RATE_MAX) {
            vm.roll(block.number + STEP);
            rolled += STEP;
            VTUSDOLD.accrueInterest();
        }
    }

    function test_debtGrowsWhileBorrowsMinusReservesStayFixed() public {
        assertEq(VTUSDOLD.reserveFactorMantissa(), 1e18);

        uint256 borrowsBefore = VTUSDOLD.totalBorrows();
        uint256 gapBefore = borrowsBefore - VTUSDOLD.totalReserves();
        uint256 rateBefore = _rate();

        vm.roll(block.number + BLOCKS_PER_DAY);
        VTUSDOLD.accrueInterest();

        uint256 borrowsAfter = VTUSDOLD.totalBorrows();
        console2.log("borrows before (TUSDOLD)", borrowsBefore / 1e18);
        console2.log("borrows after 1 day     ", borrowsAfter / 1e18);

        assertEq(borrowsAfter - VTUSDOLD.totalReserves(), gapBefore);
        assertGt(borrowsAfter, (borrowsBefore * 125) / 100);
        assertGt(_rate(), rateBefore);
    }

    function test_marketFreezesOnceRateCapIsReached() public {
        uint256 rolled = _rollUntilCapped();
        console2.log("days until cap", rolled / BLOCKS_PER_DAY);
        console2.log("borrows at cap (TUSDOLD)", VTUSDOLD.totalBorrows() / 1e18);

        vm.roll(block.number + 1);

        vm.expectRevert(bytes("borrow rate is absurdly high"));
        VTUSDOLD.accrueInterest();

        vm.expectRevert(bytes("borrow rate is absurdly high"));
        VTUSDOLD.repayBorrow(1);

        address zeroRateModel = _deployZeroRateModel();

        vm.prank(NORMAL_TIMELOCK);
        vm.expectRevert(bytes("borrow rate is absurdly high"));
        VTUSDOLD._setInterestRateModel(zeroRateModel);

        vm.prank(FAST_TRACK_TIMELOCK);
        vm.expectRevert(bytes("borrow rate is absurdly high"));
        VTUSDOLD._setInterestRateModel(zeroRateModel);
    }

    function test_zeroRateModelStopsAccrualWhenSetBeforeCap() public {
        address zeroRateModel = _deployZeroRateModel();

        vm.roll(block.number + 1);
        vm.prank(FAST_TRACK_TIMELOCK);
        assertEq(VTUSDOLD._setInterestRateModel(zeroRateModel), 0);
        assertEq(VTUSDOLD.interestRateModel(), zeroRateModel);

        uint256 borrows = VTUSDOLD.totalBorrows();
        uint256 reserves = VTUSDOLD.totalReserves();

        vm.roll(block.number + 30 * BLOCKS_PER_DAY);
        assertEq(VTUSDOLD.accrueInterest(), 0);

        assertEq(VTUSDOLD.totalBorrows(), borrows);
        assertEq(VTUSDOLD.totalReserves(), reserves);
    }

    function _deployZeroRateModel() internal returns (address) {
        return
            deployCode(
                "JumpRateModel.sol:JumpRateModel",
                abi.encode(uint256(0), uint256(0), uint256(0), uint256(1e18), uint256(70_080_000))
            );
    }
}
