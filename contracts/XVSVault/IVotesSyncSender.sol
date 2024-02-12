// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

/**
 * @title IVotesSyncSender
 * @author Venus
 * @notice Interface implemented by `VotesSyncReceiver`
 */
interface IVotesSyncSender {
    /**
     * @notice Sync votes of user on BSC chain
     * @param payload  The payload to be sent to the BSC chain. It's computed as follows: payload = abi.encode(delegatee, checkpoint, votes )
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the BSC chain
     */

    function syncVotes(bytes calldata payload, bytes calldata adapterParams) external payable;

    /**
     * @notice Estimates LayerZero fees for cross-chain message delivery to the BSC chain
     * @dev The estimated fees are the minimum required; it's recommended to increase the fees amount when sending a message. The unused amount will be refunded
     * @param payload The payload to be sent to the BSC chain. It's computed as follows: payload = abi.encode(delegatee, checkpoint, votes)
     * @param adapterParams The params used to specify the custom amount of gas required for the execution on the BSC chain
     * @return nativeFee The amount of fee in the native gas token (e.g. ETH)
     * @return zroFee The amount of fee in ZRO token
     */
    function estimateFee(
        bytes calldata payload,
        bytes calldata adapterParams
    ) external view returns (uint256, uint256);
}
