// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause


export interface Invariant {
	held: boolean
  checker: (world: any) => Promise<void>;
}
