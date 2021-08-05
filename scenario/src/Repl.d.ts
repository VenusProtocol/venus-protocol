// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

import {Artifacts} from './Artifact';
import {Web3} from './Web3';

declare namespace NodeJS {
    interface Global {
        Web3: Web3
        Artifacts: Artifacts
    }
}
