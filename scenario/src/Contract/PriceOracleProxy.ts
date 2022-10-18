import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Callable, Sendable } from "../Invokation";

interface PriceOracleProxyMethods {
  getUnderlyingPrice(asset: string): Callable<number>;
  v1PriceOracle(): Callable<string>;
  setSaiPrice(amount: encodedNumber): Sendable<number>;
}

export interface PriceOracleProxy extends Contract {
  methods: PriceOracleProxyMethods;
}
