// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { IVToken } from "../../Tokens/VTokens/interfaces/IVToken.sol";
import { VAIControllerInterface } from "../../Tokens/VAI/VAIControllerInterface.sol";
import { IFacetBase } from "../Diamond/interfaces/IFacetBase.sol";
import { IMarketFacet } from "../Diamond/interfaces/IMarketFacet.sol";
import { IPolicyFacet } from "../Diamond/interfaces/IPolicyFacet.sol";
import { IRewardFacet } from "../Diamond/interfaces/IRewardFacet.sol";
import { ISetterFacet } from "../Diamond/interfaces/ISetterFacet.sol";
import { IComptrollerStorage } from "./IComptrollerStorage.sol";

interface IComptroller is IComptrollerStorage, IFacetBase, IMarketFacet, IPolicyFacet, IRewardFacet, ISetterFacet {}
