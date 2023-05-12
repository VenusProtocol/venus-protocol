// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "../Liquidator/Liquidator.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

contract LiquidatorHarness is Liquidator {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address comptroller_, address payable vBnb_, address wBnb_) Liquidator(comptroller_, vBnb_, wBnb_) {}

    function initialize(
        uint256 liquidationIncentiveMantissa_,
        address accessControlManager_,
        address protocolShareReserve_
    ) external override initializer {
        __Liquidator_init(liquidationIncentiveMantissa_, accessControlManager_, protocolShareReserve_);
    }

    event DistributeLiquidationIncentive(uint256 seizeTokensForTreasury, uint256 seizeTokensForLiquidator);

    /// @dev Splits the received vTokens between the liquidator and treasury.
    function distributeLiquidationIncentive(
        IVToken vTokenCollateral,
        uint256 siezedAmount
    ) public returns (uint256 ours, uint256 theirs) {
        (ours, theirs) = super._distributeLiquidationIncentive(vTokenCollateral, siezedAmount);
        emit DistributeLiquidationIncentive(ours, theirs);
        return (ours, theirs);
    }

    /// @dev Computes the amounts that would go to treasury and to the liquidator.
    function splitLiquidationIncentive(uint256 seizedAmount) public view returns (uint256 ours, uint256 theirs) {
        return super._splitLiquidationIncentive(seizedAmount);
    }
}
