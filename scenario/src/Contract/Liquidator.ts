import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Sendable } from "../Invokation";

interface LiquidatorMethods {
  liquidateBorrow(
    vToken: string,
    borrower: string,
    repayAmount: encodedNumber,
    vTokenCollateral: string,
  ): Sendable<void>;
}

export interface Liquidator extends Contract {
  methods: LiquidatorMethods;
}
