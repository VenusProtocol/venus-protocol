import { Contract } from "../Contract";
import { Sendable } from "../Invokation";

interface ComptrollerImplMethods {
  _become(controller: string): Sendable<string>;
}

export interface ComptrollerImpl extends Contract {
  methods: ComptrollerImplMethods;
}
