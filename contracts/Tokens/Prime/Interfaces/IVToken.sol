pragma solidity 0.8.13;

interface IVToken {
    function borrowBalanceStored(address account) external view returns (uint);

    function exchangeRateStored() external view returns (uint);

    function balanceOf(address account) external view returns (uint);

    function underlying() external view returns (address);

    function totalBorrows() external view returns (uint);

    function borrowRatePerBlock() external view returns (uint);

    function reserveFactorMantissa() external view returns (uint);

    function decimals() external view returns (uint8);
}