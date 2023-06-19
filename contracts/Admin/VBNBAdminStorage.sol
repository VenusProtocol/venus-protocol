// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

interface VTokenInterface {
    function _reduceReserves(uint reduceAmount) external returns (uint);

    function _acceptAdmin() external returns (uint);
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
    VTokenInterface public vBNB;
    IWBNB public WBNB;
    IProtocolShareReserve public protocolShareReserve;
    address public comptroller;

    /// @notice gap to prevent collision in inheritence
    uint256[49] private __gap;
}
