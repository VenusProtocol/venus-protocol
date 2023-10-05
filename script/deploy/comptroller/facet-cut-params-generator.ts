import fs from "fs";
import { ethers } from "hardhat";

import { FacetCutAction, getSelectors } from "./diamond";

/**
 * This script is used to generate the cut-params which will be used in diamond proxy vip
 * to add diamond facets
 */

// Insert the addresses of the deployed facets to generate thecut params according for the same.
const facetsAddresses = {
  MarketFacet: "",
  PolicyFacet: "",
  RewardFacet: "",
  SetterFacet: "",
};

// Set actions to the cut params to perform
// i.e. Add, Remove, Replace function selectors in the mapping.
const facetsActions = {
  MarketFacet: FacetCutAction.Add,
  PolicyFacet: FacetCutAction.Add,
  RewardFacet: FacetCutAction.Add,
  SetterFacet: FacetCutAction.Add,
};

// Set interfaces for the setters to generate function selectors from
const FacetsInterfaces = {
  MarketFacet: "IMarketFacet",
  PolicyFacet: "IPolicyFacet",
  RewardFacet: "IRewardFacet",
  SetterFacet: "ISetterFacet",
};

// Facets for which cute params need to generate
const FacetNames = ["MarketFacet", "PolicyFacet", "RewardFacet", "SetterFacet"];

// Name of the file to write the cut-params
const jsonFileName = "cur-params-test";

async function generateCutParams() {
  const cut: any = [];

  for (const FacetName of FacetNames) {
    const FacetInterface = await ethers.getContractAt(FacetsInterfaces[FacetName], facetsAddresses[FacetName]);

    switch (facetsActions[FacetName]) {
      case FacetCutAction.Add:
        cut.push({
          facetAddress: facetsAddresses[FacetName],
          action: FacetCutAction.Add,
          functionSelectors: getSelectors(FacetInterface),
        });
        break;
      case FacetCutAction.Remove:
        cut.push({
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: getSelectors(FacetInterface),
        });
        break;
      case FacetCutAction.Replace:
        cut.push({
          facetAddress: facetsAddresses[FacetName],
          action: FacetCutAction.Replace,
          functionSelectors: getSelectors(FacetInterface),
        });
        break;
      default:
        break;
    }
  }

  function getFunctionSelector(selectors: any) {
    const functionSelector: any = [];
    for (let i = 0; i < selectors.length; i++) {
      if (selectors[i][0] == "0") {
        functionSelector.push(selectors[i]);
      } else {
        break;
      }
    }
    return functionSelector;
  }

  function makeCutParam(cut: any) {
    const cutParams = [];
    for (let i = 0; i < cut.length; i++) {
      const arr: any = new Array(3);
      arr[0] = cut[i].facetAddress;
      arr[1] = cut[i].action;
      arr[2] = getFunctionSelector(cut[i].functionSelectors);
      cutParams.push(arr);
    }
    return cutParams;
  }
  const cutParams = { cutParams: makeCutParam(cut) };

  fs.writeFileSync(`./${jsonFileName}.json`, JSON.stringify(cutParams, null, 4));
  return cutParams;
}

generateCutParams()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
