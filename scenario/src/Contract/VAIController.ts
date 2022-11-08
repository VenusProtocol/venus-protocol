import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Callable, Sendable } from "../Invokation";

interface VAIControllerMethods {
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  _setPendingAdmin(string): Sendable<number>;
  _acceptAdmin(): Sendable<number>;
  _setComptroller(string): Sendable<number>;
  mintVAI(amount: encodedNumber): Sendable<number>;
  repayVAI(amount: encodedNumber): Sendable<{ 0: number; 1: number }>;
  getMintableVAI(string): Callable<{ 0: number; 1: number }>;
  liquidateVAI(
    borrower: string,
    repayAmount: encodedNumber,
    vTokenCollateral: string,
  ): Sendable<{ 0: number; 1: number }>;
  _setTreasuryData(guardian, address, percent: encodedNumber): Sendable<number>;
  initialize(): Sendable<void>;
}

export interface VAIController extends Contract {
  methods: VAIControllerMethods;
}
