pragma solidity ^0.5.16;

interface IProtocolShareReserveV5 {
    enum IncomeType {
        SPREAD,
        LIQUIDATION
    }

    function updateAssetsState(address comptroller, address asset, IncomeType kind) external;
}
