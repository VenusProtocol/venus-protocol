// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { IVBep20 } from "../InterfacesV8.sol";

contract TokenRedeemer is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    error RedeemFailed(uint256 errCode);

    constructor(address owner_) {
        ensureNonzeroAddress(owner_);
        _transferOwnership(owner_);
    }

    function redeemAndTransfer(IVBep20 vToken, address destination) external nonReentrant onlyOwner {
        IERC20 underlying = IERC20(vToken.underlying());
        uint256 err = vToken.redeem(vToken.balanceOf(address(this)));
        if (err != 0) {
            revert RedeemFailed(err);
        }
        _transferAll(underlying, destination);
    }

    function sweepTokens(IERC20 token, address destination) external onlyOwner {
        _transferAll(token, destination);
    }

    function _transferAll(IERC20 token, address destination) internal {
        token.safeTransfer(destination, token.balanceOf(address(this)));
    }
}
