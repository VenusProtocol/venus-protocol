// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "./VBNBAdminStorage.sol";

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
     * @dev PSR setter.
     * @param protocolShareReserve_ Address of the PSR contract
     */
    function setProtocolShareReserve(IProtocolShareReserve protocolShareReserve_) external {
        require(msg.sender == owner(), "only owner can set PSR");

        require(address(protocolShareReserve_) != address(0), "PSR address invalid");
        emit ProtocolShareReserveUpdated(protocolShareReserve, protocolShareReserve_);
        protocolShareReserve = protocolShareReserve_;
    }

    /**
     * @notice Reduce reserves of vBNB
     * @param reduceAmount amount of reserves to reduce
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
     * @notice Accept admin for vBNB
     */
    function acceptVBNBAdmin() external onlyOwner nonReentrant returns (uint) {
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
    fallback(bytes calldata data) external payable onlyOwner returns (bytes memory) {
        (bool ok, bytes memory res) = address(vBNB).call{ value: msg.value }(data);
        require(ok, "call failed");
        return res;
    }
}
