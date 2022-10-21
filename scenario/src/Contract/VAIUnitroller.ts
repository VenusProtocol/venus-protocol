import { Contract } from "../Contract";
import { Callable, Sendable } from "../Invokation";

interface VAIUnitrollerMethods {
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  _acceptAdmin(): Sendable<number>;
  _setPendingAdmin(pendingAdmin: string): Sendable<number>;
  _setPendingImplementation(pendingImpl: string): Sendable<number>;
  vaicontrollerImplementation(): Callable<string>;
  pendingVAIControllerImplementation(): Callable<string>;
}

export interface VAIUnitroller extends Contract {
  methods: VAIUnitrollerMethods;
}
