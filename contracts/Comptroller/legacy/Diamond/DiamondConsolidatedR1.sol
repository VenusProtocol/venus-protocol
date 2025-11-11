// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { MarketFacetR1 } from "./facets/MarketFacetR1.sol";
import { PolicyFacetR1 } from "./facets/PolicyFacetR1.sol";
import { RewardFacetR1 } from "./facets/RewardFacetR1.sol";
import { SetterFacetR1 } from "./facets/SetterFacetR1.sol";
import { DiamondR1 } from "./DiamondR1.sol";

/**
 * @title DiamondConsolidated
 * @author Venus
 * @notice This contract contains the functions defined in the different facets of the Diamond, plus the getters to the public variables.
 * This contract cannot be deployed, due to its size. Its main purpose is to allow the easy generation of an ABI and the typechain to interact with the
 * Unitroller contract in a simple way
 */
contract DiamondConsolidatedR1 is DiamondR1, MarketFacetR1, PolicyFacetR1, RewardFacetR1, SetterFacetR1 {}
