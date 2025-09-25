// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MockFlashLoanReceiver.sol";
import { ComptrollerInterface } from "../Comptroller/ComptrollerInterface.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";

contract BorrowDebtFlashLoanReceiver is MockFlashLoanReceiver {
    constructor(ComptrollerInterface comptroller) MockFlashLoanReceiver(comptroller) {}

    function executeOperation(
        VToken[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata,
        address onBehalf,
        bytes calldata param
    ) external override returns (bool, uint256[] memory) {
        // 👇 Your custom logic for the flash loan should be implemented here 👇
        /** YOUR CUSTOM LOGIC HERE */
        onBehalf;
        param;
        // 👆 Your custom logic for the flash loan should be implemented above here 👆

        uint256[] memory approvedTokens = _approveRepaymentsBorrow(assets, amounts);
        return (true, approvedTokens);
    }

    function _approveRepaymentsBorrow(
        VToken[] calldata assets,
        uint256[] calldata amounts
    ) private returns (uint256[] memory) {
        uint256 len = assets.length;
        uint256[] memory approvedTokens = new uint256[](len);
        for (uint256 k = 0; k < len; ++k) {
            uint256 total = amounts[k]; // Intentionally not adding premiums to create debt position
            IERC20NonStandard(assets[k].underlying()).approve(address(assets[k]), total);

            approvedTokens[k] = total;
        }
        return approvedTokens;
    }
}
