// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IProtocolShareReserve, IWBNB, VBNBAdminStorage, VTokenInterface } from "./VBNBAdminStorage.sol";

/**
 * @title VBNBAdmin
 * @author Venus
 * @notice This contract is the "admin" of the vBNB market, reducing the reserves of the market, sending them to the `ProtocolShareReserve` contract,
 * and allowing the executions of the rest of the privileged functions in the vBNB contract (after checking if the sender has the required permissions).
 */
contract VBNBAdmin is ReentrancyGuardUpgradeable, AccessControlledV8, VBNBAdminStorage {
    using SafeERC20Upgradeable for IWBNB;

    /// @notice address of vBNB
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    VTokenInterface public immutable vBNB;

    /// @notice address of WBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IWBNB public immutable WBNB;

    /// @notice Emitted when PSR is updated
    event ProtocolShareReserveUpdated(
        IProtocolShareReserve indexed oldProtocolShareReserve,
        IProtocolShareReserve indexed newProtocolShareReserve
    );

    /// @notice Emitted reserves are reduced
    event ReservesReduced(uint256 reduceAmount);

    /// @param _vBNB Address of the vBNB contract
    /// @param _WBNB Address of the WBNB token
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(VTokenInterface _vBNB, IWBNB _WBNB) {
        require(address(_WBNB) != address(0), "WBNB address invalid");
        require(address(_vBNB) != address(0), "vBNB address invalid");

        vBNB = _vBNB;
        WBNB = _WBNB;

        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /// @notice Used to initialize non-immutable variables
    function initialize(
        IProtocolShareReserve _protocolShareReserve,
        address accessControlManager
    ) external initializer {
        require(address(_protocolShareReserve) != address(0), "PSR address invalid");
        protocolShareReserve = _protocolShareReserve;

        __ReentrancyGuard_init();
        __AccessControlled_init(accessControlManager);
    }

    /**
     * @notice PSR setter.
     * @param protocolShareReserve_ Address of the PSR contract
     * @custom:access Only owner (Governance)
     * @custom:event Emits ProtocolShareReserveUpdated event.
     */
    function setProtocolShareReserve(IProtocolShareReserve protocolShareReserve_) external onlyOwner {
        require(address(protocolShareReserve_) != address(0), "PSR address invalid");
        emit ProtocolShareReserveUpdated(protocolShareReserve, protocolShareReserve_);
        protocolShareReserve = protocolShareReserve_;
    }

    /**
     * @notice Reduce reserves of vBNB, wrap them and send them to the PSR contract
     * @param reduceAmount amount of reserves to reduce
     * @custom:event Emits ReservesReduced event.
     */
    function reduceReserves(uint reduceAmount) external nonReentrant {
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
     * @notice Wraps BNB into WBNB
     */
    function _wrapBNB() internal {
        uint256 bnbBalance = address(this).balance;
        WBNB.deposit{ value: bnbBalance }();
    }

    /**
     * @notice Invoked when BNB is sent to this contract
     * @custom:access Only vBNB is considered a valid sender
     */
    receive() external payable {
        require(msg.sender == address(vBNB), "only vBNB can send BNB to this contract");
    }

    /**
     * @notice Invoked when called function does not exist in the contract. The function will be executed in the vBNB contract.
     * @custom:access Only owner (Governance)
     */
    fallback(bytes calldata data) external payable onlyOwner returns (bytes memory) {
        (bool ok, bytes memory res) = address(vBNB).call{ value: msg.value }(data);
        require(ok, "call failed");
        return res;
    }
}
