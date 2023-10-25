// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

interface VTokenInterface {
    function _reduceReserves(uint reduceAmount) external returns (uint);

    function _acceptAdmin() external returns (uint);

    function comptroller() external returns (address);
}

interface IWBNB is IERC20Upgradeable {
    function deposit() external payable;
}

interface IProtocolShareReserve {
    enum IncomeType {
        SPREAD,
        LIQUIDATION
    }

    function updateAssetsState(address comptroller, address asset, IncomeType incomeType) external;
}

contract VBNBAdminStorage {
    /// @notice address of protocol share reserve contract
    IProtocolShareReserve public protocolShareReserve;

    /// @dev gap to prevent collision in inheritence
    uint256[49] private __gap;
}
