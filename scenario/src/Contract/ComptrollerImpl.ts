// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-FileCopyrightText: 2021 Venus Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import { Contract } from '../Contract';
import { Sendable } from '../Invokation';

interface ComptrollerImplMethods {
  _become(
    controller: string
  ): Sendable<string>;
}

export interface ComptrollerImpl extends Contract {
  methods: ComptrollerImplMethods;
}
