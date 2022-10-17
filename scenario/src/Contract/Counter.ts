import { Contract } from '../Contract';
import { encodedNumber } from '../Encoding';
import { Sendable } from '../Invokation';

export interface CounterMethods {
  increment(by: encodedNumber): Sendable<boolean>;
}

export interface Counter extends Contract {
  methods: CounterMethods;
  name: string;
}
