// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import { Contract } from '../Contract';
import { encodedNumber } from '../Encoding';
import { Callable, Sendable } from '../Invokation';

export interface CounterMethods {
  increment(by: encodedNumber): Sendable<boolean>;
}

export interface Counter extends Contract {
  methods: CounterMethods;
  name: string;
}
