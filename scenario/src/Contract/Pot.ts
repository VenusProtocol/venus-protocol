import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Callable, Sendable } from "../Invokation";

interface PotMethods {
  chi(): Callable<number>;
  dsr(): Callable<number>;
  rho(): Callable<number>;
  pie(address: string): Callable<number>;
  drip(): Sendable<void>;
  file(what: string, data: encodedNumber): Sendable<void>;
  join(amount: encodedNumber): Sendable<void>;
  exit(amount: encodedNumber): Sendable<void>;
}

export interface Pot extends Contract {
  methods: PotMethods;
  name: string;
}
