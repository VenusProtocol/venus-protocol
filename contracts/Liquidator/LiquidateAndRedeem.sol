// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IVBNB, IVBep20 } from "../InterfacesV8.sol";
import { approveOrRevert } from "../lib/approveOrRevert.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

uint256 constant NO_ERROR = 0;

contract LiquidateAndRedeem is Ownable2Step {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IVBNB public immutable V_NATIVE;

    error LiquidationFailed(uint256 errCode);
    error RedeemFailed(uint256 errCode);
    error NativeTransferFailed();

    constructor(address owner_, IVBNB vNative) {
        ensureNonzeroAddress(owner_);
        _transferOwnership(owner_);
        V_NATIVE = vNative;
    }

    receive() external payable {}

    function liquidateAndRedeemNative(address borrower, IVBep20 vTokenBorrowed, address receiver) external {
        _liquidateSeizingVNative(borrower, vTokenBorrowed);
        _redeemAllNative();
        _transferAllNative(receiver);
    }

    function sweepNative(address receiver) external onlyOwner {
        _transferAllNative(receiver);
    }

    function sweepTokens(IERC20Upgradeable token, address receiver) external onlyOwner {
        _transferAll(token, receiver);
    }

    function _liquidateSeizingVNative(address borrower, IVBep20 vTokenBorrowed) internal {
        IERC20Upgradeable borrowedAsset = IERC20Upgradeable(vTokenBorrowed.underlying());
        uint256 repayAmount = borrowedAsset.balanceOf(address(this));
        approveOrRevert(borrowedAsset, address(vTokenBorrowed), repayAmount);
        uint256 err = vTokenBorrowed.liquidateBorrow(borrower, repayAmount, V_NATIVE);
        if (err != NO_ERROR) {
            revert LiquidationFailed(err);
        }
        approveOrRevert(borrowedAsset, address(vTokenBorrowed), 0);
    }

    function _redeemAllNative() internal {
        uint256 vTokens = V_NATIVE.balanceOf(address(this));
        uint256 err = V_NATIVE.redeem(vTokens);
        if (err != NO_ERROR) {
            revert RedeemFailed(err);
        }
    }

    function _transferAllNative(address receiver) internal {
        (bool success, ) = receiver.call{ value: address(this).balance }("");
        if (!success) {
            revert NativeTransferFailed();
        }
    }

    function _transferAll(IERC20Upgradeable token, address receiver) internal {
        token.safeTransfer(receiver, token.balanceOf(address(this)));
    }
}
