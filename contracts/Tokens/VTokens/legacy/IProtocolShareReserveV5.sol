pragma solidity ^0.5.16;

interface IProtocolShareReserveV5 {
    enum IncomeType {
        SPREAD,
        LIQUIDATION,
        FLASHLOAN
    }

    function updateAssetsState(address comptroller, address asset, IncomeType kind) external;
}
