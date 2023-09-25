// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IProtocolShareReserve {
    enum Schema {
        DEFAULT,
        SPREAD_PRIME_CORE
    }

    function releaseFunds(address comptroller, address[] memory assets) external;

    function getUnreleasedFunds(
        address comptroller,
        Schema schema,
        address destination,
        address asset
    ) external view returns (uint256);

    function getPercentageDistribution(address destination, Schema schema) external view returns (uint256);

    function MAX_PERCENT() external view returns (uint256);
}
