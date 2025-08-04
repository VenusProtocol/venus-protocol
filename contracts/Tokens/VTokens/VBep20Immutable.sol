// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IComptroller } from "../../Comptroller/interfaces/IComptroller.sol";
import { InterestRateModelV8 } from "../../InterestRateModels/InterestRateModelV8.sol";
import { VBep20 } from "./VBep20.sol";

/**
 * @title Venus's VBep20Immutable Contract
 * @notice VTokens which wrap an EIP-20 underlying and are immutable
 * @author Venus
 */
contract VBep20Immutable is VBep20 {
    /**
     * @notice Construct a new money market
     * @param underlying_ The address of the underlying asset
     * @param comptroller_ The address of the comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ BEP-20 name of this token
     * @param symbol_ BEP-20 symbol of this token
     * @param decimals_ BEP-20 decimal precision of this token
     * @param admin_ Address of the administrator of this token
     */
    constructor(
        address underlying_,
        IComptroller comptroller_,
        InterestRateModelV8 interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    ) {
        // Creator of the contract is admin during initialization
        admin = payable(msg.sender);

        // Initialize the market
        initialize(
            underlying_,
            comptroller_,
            interestRateModel_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_
        );

        // Set the proper admin now that initialization is done
        admin = admin_;
    }
}
