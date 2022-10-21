import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Callable } from "../Invokation";

interface InterestRateModelMethods {
  getBorrowRate(cash: encodedNumber, borrows: encodedNumber, reserves: encodedNumber): Callable<number>;
}

export interface InterestRateModel extends Contract {
  methods: InterestRateModelMethods;
  name: string;
}
