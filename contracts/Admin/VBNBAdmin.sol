// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "./VBNBAdminStorage.sol";

contract VBNBAdmin is ReentrancyGuardUpgradeable, AccessControlledV8, VBNBAdminStorage {
    using SafeERC20Upgradeable for IWBNB;

    /// @notice Emitted when PSR is updated
    event ProtocolShareReserveUpdated(
        IProtocolShareReserve indexed oldProtocolShareReserve,
        IProtocolShareReserve indexed newProtocolShareReserve
    );

    /// @notice Emitted reserves are reduced
    event ReservesReduced(uint256 reduceAmount);

    function initialize(
        VTokenInterface _vBNB,
        IProtocolShareReserve _protocolShareReserve,
        IWBNB _WBNB,
        address accessControlManager
    ) external initializer {
        vBNB = _vBNB;
        protocolShareReserve = _protocolShareReserve;
        WBNB = _WBNB;

        __ReentrancyGuard_init();
        __AccessControlled_init(accessControlManager);
    }

    /**
     * @dev PSR setter.
     * @param protocolShareReserve_ Address of the PSR contract
     */
    function setProtocolShareReserve(IProtocolShareReserve protocolShareReserve_) external {
        _checkAccessAllowed("setProtocolShareReserve(address)");

        require(address(protocolShareReserve_) != address(0), "PSR address invalid");
        IProtocolShareReserve oldProtocolShareReserve = protocolShareReserve;
        protocolShareReserve = protocolShareReserve_;
        emit ProtocolShareReserveUpdated(oldProtocolShareReserve, protocolShareReserve);
    }

    /**
     * @notice Reduce reserves of vBNB
     * @param reduceAmount amount of reserves to reduce
     */
    function reduceReserves(uint reduceAmount) external nonReentrant {
        _checkAccessAllowed("reduceReserves(uint256)");

        require(vBNB._reduceReserves(reduceAmount) == 0, "reduceReserves failed");
        _wrapBNB();

        uint256 balance = WBNB.balanceOf(address(this));
        WBNB.safeTransfer(address(protocolShareReserve), balance);
        protocolShareReserve.updateAssetsState(
            vBNB.comptroller(),
            address(WBNB),
            IProtocolShareReserve.IncomeType.SPREAD
        );

        emit ReservesReduced(reduceAmount);
    }

    /**
     * @notice Accept admin for vBNB
     */
    function acceptVBNBAdmin() external nonReentrant returns (uint) {
        require(msg.sender == owner(), "only owner can accept admin");
        return vBNB._acceptAdmin();
    }

    /**
     * @notice Wraps BNB into WBNB
     */
    function _wrapBNB() internal {
        uint256 bnbBalance = address(this).balance;
        WBNB.deposit{ value: bnbBalance }();
    }

    /**
     * @notice Invoked when BNB is sent to this contract
     */
    receive() external payable {
        require(msg.sender == address(vBNB), "only vBNB can send BNB to this contract");
    }

    /**
     * @notice Invoked when called function does not exist in the contract
     */
    fallback(bytes calldata data) external payable returns (bytes memory) {
        require(msg.sender == owner(), "only owner can call vBNB admin functions");

        (bool ok, bytes memory res) = address(vBNB).call{ value: msg.value }(data);
        require(ok, "call failed");
        return res;
    }
}
