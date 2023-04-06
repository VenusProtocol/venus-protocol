// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.13;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

contract PegStability is AccessControlledV8, ReentrancyGuardUpgradeable {
    address public immutable vaiAddress;
    address public immutable stableToken;
    uint256 public constant BASIS_POINTS_DIVISOR = 1000;
    uint256 public feeIn; // fee is in basis points
    uint256 public feeOut; // fee is in basis points
    uint256 public vaiMintCap; // max amount of VAI that can be minted through this contract
    bool public isPaused;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @notice Event emitted when contract is paused
    event PsmPaused(address indexed admin);

    /// @notice Event emitted when the contract is resumed after pause
    event PsmResumed(address indexed admin);

    /// @notice Event emitted when the feeIn state var is modified
    event FeeInChanged(uint256 oldFeeIn, uint256 newFeeIn);

    /// @notice Event emitted when the feeOut state var is modified
    event FeeOutChanged(uint256 oldFeeOut, uint256 newFeeOut);

    /// @notice Event emitted when the vaiMintCap state var is modified
    event VaiMintCapChanged(uint256 oldCap, uint256 newCap);

    /**
     * @dev Prevents functions to execute when contract is paused.
     */
    modifier isActive() {
        require(isPaused == false, "Contract is paused");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address stableToken_, address vaiAddress_) {
        ensureNonzeroAddress(stableToken_);
        ensureNonzeroAddress(vaiAddress_);
        stableToken = stableToken_;
        vaiAddress = vaiAddress_;
        _disableInitializers();
    }

    function initialize(
        address accessControlManager_,
        uint256 feeIn_,
        uint256 feeOut_,
        uint256 vaiMintCap_
    ) external initializer {
        __AccessControlled_init(accessControlManager_);
        feeIn = feeIn_;
        feeOut = feeOut_;
        vaiMintCap = vaiMintCap_;
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "can't be zero address");
    }

    function pause() external {
        _checkAccessAllowed("pause()");
        require(isPaused == false, "PSM is already paused");
        isPaused = true;
        emit PsmPaused(msg.sender);
    }

    function resume() external {
        _checkAccessAllowed("resume()");
        require(isPaused == true, "Vault is not paused");
        isPaused = false;
        emit PsmResumed(msg.sender);
    }

    function setFeeIn(uint256 feeIn_) external {
        _checkAccessAllowed("setFeeIn(uint256)");
        // feeIn = 1000 = 100%
        require(feeIn < 1000, "Invalid fee");
        uint256 oldFeeIn = feeIn;
        feeIn = feeIn_;
        emit FeeInChanged(oldFeeIn, feeIn_);
    }

    function setFeeOut(uint256 feeOut_) external {
        _checkAccessAllowed("setFeeOut(uint256)");
        // feeOut = 1000 = 100%
        require(feeOut < 1000, "Invalid fee");
        uint256 oldFeeOut = feeOut;
        feeOut = feeOut_;
        emit FeeOutChanged(oldFeeOut, feeOut_);
    }

    function setVaiMintCap(uint256 vaiMintCap_) external {
        _checkAccessAllowed("setVaiMintCap(uint256)");
        //NOTE: not really sure what upper bounds we should have for maximum MINT CAP
        uint256 oldVaiMintCap = vaiMintCap;
        vaiMintCap = vaiMintCap_;
        emit VaiMintCapChanged(oldVaiMintCap, vaiMintCap);
    }
}
