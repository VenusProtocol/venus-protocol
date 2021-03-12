import {Contract} from '../Contract';
import {Callable, Sendable} from '../Invokation';
import {encodedNumber} from '../Encoding';

interface VAIControllerMethods {
  admin(): Callable<string>
  pendingAdmin(): Callable<string>
  _setPendingAdmin(string): Sendable<number>
  _acceptAdmin(): Sendable<number>
  _setComptroller(string): Sendable<number>
  mintVAI(amount: encodedNumber): Sendable<number>
  repayVAI(amount: encodedNumber): Sendable<{0: number, 1: number}>
  getMintableVAI(string): Callable<{0: number, 1: number}>
  liquidateVAI(borrower: string, repayAmount: encodedNumber, vTokenCollateral: string): Sendable<{0: number, 1: number}>;
}

export interface VAIController extends Contract {
  methods: VAIControllerMethods
}
