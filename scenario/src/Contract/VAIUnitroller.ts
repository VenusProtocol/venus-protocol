// SPDX-FileCopyrightText: 2021 Venus Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';

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
