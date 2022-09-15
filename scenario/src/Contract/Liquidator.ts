import {Contract} from '../Contract';
import {Callable, Sendable} from '../Invokation';
import { encodedNumber } from '../Encoding';

interface LiquidatorMethods {
  liquidateBorrow(
    vToken: string,
    borrower: string,
    repayAmount: encodedNumber,
    vTokenCollateral: string
  ): Sendable<void>
}

export interface Liquidator extends Contract {
  methods: LiquidatorMethods
}
