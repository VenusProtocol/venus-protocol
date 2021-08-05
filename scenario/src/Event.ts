// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause


type ScalarEvent = string;
interface EventArray extends Array<ScalarEvent | EventArray> {
    [index: number]: ScalarEvent | EventArray;
}

export type Event = EventArray;
