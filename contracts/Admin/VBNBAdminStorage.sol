// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IProtocolShareReserve } from "../external/IProtocolShareReserve.sol";

interface VTokenInterface {
    function _reduceReserves(uint reduceAmount) external returns (uint);

    function _acceptAdmin() external returns (uint);

    function comptroller() external returns (address);

    function _setInterestRateModel(address newInterestRateModel) external returns (uint);
}

interface IWBNB is IERC20Upgradeable {
    function deposit() external payable;
}

contract VBNBAdminStorage {
    /// @notice address of protocol share reserve contract
    IProtocolShareReserve public protocolShareReserve;

    /// @dev gap to prevent collision in inheritence
    uint256[49] private __gap;
}
