import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Callable, Sendable } from "../Invokation";

interface VatMethods {
  dai(address: string): Callable<number>;
  hope(address: string): Sendable<void>;
  move(src: string, dst: string, amount: encodedNumber): Sendable<void>;
}

export interface Vat extends Contract {
  methods: VatMethods;
  name: string;
}
