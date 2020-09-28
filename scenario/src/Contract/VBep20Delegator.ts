import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';
import { VTokenMethods } from './VToken';
import { encodedNumber } from '../Encoding';

interface VBep20DelegatorMethods extends VTokenMethods {
  implementation(): Callable<string>;
  _setImplementation(
    implementation_: string,
    allowResign: boolean,
    becomImplementationData: string
  ): Sendable<void>;
}

interface VBep20DelegatorScenarioMethods extends VBep20DelegatorMethods {
  setTotalBorrows(amount: encodedNumber): Sendable<void>;
  setTotalReserves(amount: encodedNumber): Sendable<void>;
}

export interface VBep20Delegator extends Contract {
  methods: VBep20DelegatorMethods;
  name: string;
}

export interface VBep20DelegatorScenario extends Contract {
  methods: VBep20DelegatorMethods;
  name: string;
}
