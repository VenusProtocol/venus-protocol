pragma solidity ^0.5.16;

import "./VBep20.sol";

/**
 * @title Venus's VBep20Delegate Contract
 * @notice VTokens which wrap an EIP-20 underlying and are delegated to
 * @author Venus
 */
contract VBep20Delegate is VBep20, VDelegateInterface {
    /**
     * @notice Construct an empty delegate
     */
    constructor() public {}

    /**
     * @notice Called by the delegator on a delegate to initialize it for duty
     * @param data The encoded bytes data for any initialization
     */
    function _becomeImplementation(bytes memory data) public {
        // Shh -- currently unused
        data;

        // Shh -- we don't ever want this hook to be marked pure
        if (false) {
            implementation = address(0);
        }

        require(msg.sender == admin, "only the admin may call _becomeImplementation");
    }

    /**
     * @notice Called by the delegator on a delegate to forfeit its responsibility
     */
    function _resignImplementation() public {
        // Shh -- we don't ever want this hook to be marked pure
        if (false) {
            implementation = address(0);
        }

        require(msg.sender == admin, "only the admin may call _resignImplementation");
    }

    function _notifyProtocolShareReserve() internal {
        IProtocolShareReserve(protocolShareReserve).updateAssetsState(
            address(comptroller),
            underlying,
            IProtocolShareReserve.IncomeType.SPREAD
        );
    }

    /**
     * @notice A public function to set new threshold of block difference after which funds will be sent to the protocol share reserve
     * @param _newReduceReservesBlockDelta block difference value
     */
    function setReduceReservesBlockDelta(uint256 _newReduceReservesBlockDelta) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_REDUCE_RESERVES_BLOCK_DELTA_OWNER_CHECK);
        }
        uint256 oldReduceReservesBlockDelta_ = reduceReservesBlockDelta;
        reduceReservesBlockDelta = _newReduceReservesBlockDelta;
        emit NewReduceReservesBlockDelta(oldReduceReservesBlockDelta_, _newReduceReservesBlockDelta);
    }

    /**
     * @notice A public function to set new threshold of block difference after which funds will be sent to the protocol share reserve
     * @param protcolShareReserve_ The address of protocol share reserve contract
     */
    function setProtcolShareReserve(address payable protcolShareReserve_) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_PROTOCOL_SHARE_RESERVES_OWNER_CHECK);
        }
        address oldProtocolShareReserve_ = protocolShareReserve;
        protocolShareReserve = protcolShareReserve_;
        emit NewProtocolShareReserve(oldProtocolShareReserve_, protcolShareReserve_);
    }

    function _isProtocolShareReseveTransferrable() internal returns (bool) {
        uint256 currentBlockNumber_ = getBlockNumber();
        if (currentBlockNumber_ - reduceReservesBlockNumber >= reduceReservesBlockDelta) {
            reduceReservesBlockNumber = currentBlockNumber_;
            return true;
        }
        return false;
    }

    function _checkSpreadReservesTransferable() internal view returns (bool) {
        if (reduceReservesBlockNumber == getBlockNumber()) return true;
        return false;
    }
}
