// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import {Invariant} from '../Invariant';
import {fail, World} from '../World';
import {getCoreValue} from '../CoreValue';
import {Value} from '../Value';
import {Event} from '../Event';

export class SuccessInvariant implements Invariant {
	held = false;

	constructor() {}

  async checker(world: World): Promise<void> {
    if (world.lastInvokation && !world.lastInvokation.success()) {
      fail(world, `Success invariant broken! Expected successful execution, but had error ${world.lastInvokation.toString()}`);
    }
  }

  toString() {
    return `SuccessInvariant`;
  }
}
