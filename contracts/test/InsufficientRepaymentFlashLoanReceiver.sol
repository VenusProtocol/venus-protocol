// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MockFlashLoanReceiver.sol";
import { ComptrollerInterface } from "../Comptroller/ComptrollerInterface.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";

contract InsufficientRepaymentFlashLoanReceiver is MockFlashLoanReceiver {
    constructor(ComptrollerInterface comptroller) MockFlashLoanReceiver(comptroller) {}

    function executeOperation(
        VToken[] calldata assets,
        uint256[] calldata,
        uint256[] calldata premiums,
        address onBehalf,
        bytes calldata param
    ) external override returns (bool, uint256[] memory) {
        onBehalf;
        param;

        uint256[] memory approvedTokens = _approveInsufficientRepayments(assets, premiums);
        return (true, approvedTokens);
    }

    function _approveInsufficientRepayments(
        VToken[] calldata assets,
        uint256[] calldata premiums
    ) private returns (uint256[] memory) {
        uint256 len = assets.length;
        uint256[] memory approvedTokens = new uint256[](len);

        for (uint256 k = 0; k < len; ++k) {
            // Approve only half of the premium (fee) - intentionally insufficient
            uint256 insufficientAmount = premiums[k] / 2;
            IERC20NonStandard(assets[k].underlying()).approve(address(assets[k]), insufficientAmount);

            approvedTokens[k] = insufficientAmount;
        }
        return approvedTokens;
    }
}
