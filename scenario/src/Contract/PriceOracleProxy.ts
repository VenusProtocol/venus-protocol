// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import {Contract} from '../Contract';
import {Callable, Sendable} from '../Invokation';
import {encodedNumber} from '../Encoding';

interface PriceOracleProxyMethods {
  getUnderlyingPrice(asset: string): Callable<number>
  v1PriceOracle(): Callable<string>;
  setSaiPrice(amount: encodedNumber): Sendable<number>
}

export interface PriceOracleProxy extends Contract {
  methods: PriceOracleProxyMethods
}
