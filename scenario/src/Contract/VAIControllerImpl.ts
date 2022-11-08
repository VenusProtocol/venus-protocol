import { Contract } from "../Contract";
import { Sendable } from "../Invokation";

interface VAIControllerImplMethods {
  _become(controller: string): Sendable<string>;
}

export interface VAIControllerImpl extends Contract {
  methods: VAIControllerImplMethods;
}
