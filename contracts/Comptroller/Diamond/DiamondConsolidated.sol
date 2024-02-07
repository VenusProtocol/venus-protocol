pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./facets/MarketFacet.sol";
import "./facets/PolicyFacet.sol";
import "./facets/RewardFacet.sol";
import "./facets/SetterFacet.sol";
import "./Diamond.sol";

/**
 * @title DiamondConsolidated
 * @author Venus
 * @notice This contract contains the functions defined in the different facets of the Diamond, plus the getters to the public variables.
 * This contract cannot be deployed, due to its size. Its main purpose is to allow the easy generation of an ABI and the typechain to interact with the
 * Unitroller contract in a simple way
 */
contract DiamondConsolidated is Diamond, MarketFacet, PolicyFacet, RewardFacet, SetterFacet {}
