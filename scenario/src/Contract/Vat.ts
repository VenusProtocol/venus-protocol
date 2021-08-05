// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';
import { encodedNumber } from '../Encoding';

interface VatMethods {
  dai(address: string): Callable<number>;
  hope(address: string): Sendable<void>;
  move(src: string, dst: string, amount: encodedNumber): Sendable<void>;
}

export interface Vat extends Contract {
  methods: VatMethods;
  name: string;
}
