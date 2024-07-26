// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { IVBNB, IVBep20, IVToken, IVAIController } from "../InterfacesV8.sol";
import { Liquidator } from "../Liquidator/Liquidator.sol";
import { Currency, CurrencyLibrary } from "../lib/Currency.sol";

contract LiquidationHelper is Ownable2Step {
    using CurrencyLibrary for Currency;

    Liquidator public immutable LIQUIDATOR_CONTRACT;
    IVAIController public immutable VAI_CONTROLLER;
    IVBNB public immutable VBNB;

    struct LiquidationOrder {
        address borrower;
        IVToken vTokenCollateral;
        address vTokenBorrowed;
        uint256 amount;
    }

    constructor(address owner_, Liquidator liquidatorContract_, IVBNB vBNB) {
        ensureNonzeroAddress(owner_);
        LIQUIDATOR_CONTRACT = liquidatorContract_;
        VAI_CONTROLLER = liquidatorContract_.vaiController();
        VBNB = vBNB;
        _transferOwnership(owner_);
    }

    receive() external payable {}

    function liquidateBatch(LiquidationOrder[] calldata orders) external onlyOwner {
        uint256 ordersCount = orders.length;
        for (uint256 i = 0; i < ordersCount; ++i) {
            _liquidateBorrow(orders[i]);
        }
    }

    function sweepTokens(address token, address destination) external onlyOwner {
        Currency.wrap(token).transferAll(destination);
    }

    function _liquidateBorrow(LiquidationOrder calldata order) internal {
        if (order.vTokenBorrowed == address(VBNB)) {
            LIQUIDATOR_CONTRACT.liquidateBorrow{ value: order.amount }(
                order.vTokenBorrowed,
                order.borrower,
                order.amount,
                order.vTokenCollateral
            );
        } else {
            Currency underlying = _underlying(IVBep20(order.vTokenBorrowed));
            underlying.approve(address(LIQUIDATOR_CONTRACT), order.amount);
            LIQUIDATOR_CONTRACT.liquidateBorrow(
                order.vTokenBorrowed,
                order.borrower,
                order.amount,
                order.vTokenCollateral
            );
            underlying.approve(address(LIQUIDATOR_CONTRACT), 0);
        }
    }

    function _underlying(IVBep20 vToken) internal view returns (Currency) {
        if (address(vToken) == address(VAI_CONTROLLER)) {
            return Currency.wrap(VAI_CONTROLLER.getVAIAddress());
        } else {
            return Currency.wrap(vToken.underlying());
        }
    }
}
