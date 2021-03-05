import {Contract} from '../Contract';
import {Callable, Sendable} from '../Invokation';
import {encodedNumber} from '../Encoding';

interface VAIControllerMethods {
  admin(): Callable<string>
  pendingAdmin(): Callable<string>
  _setPendingAdmin(string): Sendable<number>
  _acceptAdmin(): Sendable<number>
  mintVAI(encodedNumber): Sendable<number>
  repayVAI(encodedNumber): Sendable<{0: number, 1: number}>
  //liquidateVAI(borrower: string, vTokenCollateral: string): Sendable<number>;
  liquidateVAI(borrower: string, repayAmount: encodedNumber, vTokenCollateral: string): Sendable<number>;
}

export interface VAIController extends Contract {
  methods: VAIControllerMethods
}
