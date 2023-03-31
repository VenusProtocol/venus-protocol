pragma solidity ^0.5.16;

import "../XVSVault/XVSVault.sol";
import "../Utils/IBEP20.sol";

contract XVSStakingLens {
    /**
     * @notice Get the XVS stake balance of an account
     * @param account The address of the account to check
     * @param xvsAddress The address of the XVSToken
     * @param xvsVaultProxyAddress The address of the XVSVaultProxy
     * @return stakedAmount The balance that user staked
     * @return pendingWithdrawalAmount pending withdrawal amount of user.
     */
    function getStakedData(
        address account,
        address xvsAddress,
        address xvsVaultProxyAddress
    ) external view returns (uint256 stakedAmount, uint256 pendingWithdrawalAmount) {
        XVSVault xvsVaultInstance = XVSVault(xvsVaultProxyAddress);
        uint256 poolLength = xvsVaultInstance.poolLength(xvsAddress);

        for (uint256 pid = 0; pid < poolLength; ++pid) {
            (IBEP20 token, , , , ) = xvsVaultInstance.poolInfos(xvsAddress, pid);
            if (address(token) == address(xvsAddress)) {
                // solhint-disable-next-line no-unused-vars
                (uint256 userAmount, uint256 userRewardDebt, uint256 userPendingWithdrawals) = xvsVaultInstance
                    .getUserInfo(xvsAddress, pid, account);
                stakedAmount = userAmount;
                pendingWithdrawalAmount = userPendingWithdrawals;
                break;
            }
        }

        return (stakedAmount, pendingWithdrawalAmount);
    }
}
