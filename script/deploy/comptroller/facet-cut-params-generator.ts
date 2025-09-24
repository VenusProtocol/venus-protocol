import fs from "fs";
import { deployments, ethers, network } from "hardhat";

import { FacetCutAction, getSelectors } from "./diamond";

/**
 * This script is used to generate the cut-params which will be used in diamond proxy vip
 * to add diamond facets
 */

// Insert the addresses of the deployed facets to generate the cut params, do not change the order.
const newFacetAddresses = {
  MarketFacet: "",
  PolicyFacet: "",
  RewardFacet: "",
  SetterFacet: "",
  FacetBase: "*FacetBase",
};

// Set interfaces for the setters to generate function selectors from
const FacetsInterfaces = {
  MarketFacet: "IMarketFacet",
  PolicyFacet: "IPolicyFacet",
  RewardFacet: "IRewardFacet",
  SetterFacet: "ISetterFacet",
  FacetBase: "IFacetBase",
};

// Facets for which cut params need to generate
const FacetNames = ["MarketFacet", "PolicyFacet", "RewardFacet", "SetterFacet", "FacetBase"];

// Name of the file to write the cut-params
const jsonFileName = `cut-params-${network.name}`;

async function generateCutParams() {
  const comptrollerDeployment = await deployments.get("Unitroller");
  const diamondAddress = comptrollerDeployment.address;
  const diamond = await ethers.getContractAt("Diamond", diamondAddress);
  const currentFacets = await diamond.facets();

  // Build a global set of all selectors currently in the diamond to filter out redundent selectors
  const globalReplaced = new Set<string>();
  for (const f of currentFacets) {
    for (const sel of f.functionSelectors) {
      globalReplaced.add(sel.toLowerCase());
    }
  }

  const cut: any[] = [];

  for (let i = 0; i < FacetNames.length; i++) {
    const facetName = FacetNames[i];
    const newFacetAddress = newFacetAddresses[facetName];

    // Current facet selectors (from diamond, assuming the facet addresses in the same order as newFacetAddresses)
    const currentSelectors: string[] = facetName === "FacetBase" ? [] : currentFacets[i].functionSelectors;

    // New facet selectors (from interface)
    const newFacetInterface = await ethers.getContractAt(FacetsInterfaces[facetName], newFacetAddress);
    const newSelectors: string[] = getSelectors(newFacetInterface);

    const currentSet = new Set(currentSelectors.map(s => s.toLowerCase()));

    // Replace = already in this facet
    const replaceSelectors = [...currentSet];

    // Add = not in current facet AND not globally occupied already
    const addSelectors = newSelectors.filter(
      s => !currentSet.has(s.toLowerCase()) && !globalReplaced.has(s.toLowerCase()),
    );

    // Update global registry only for selectors that are being added
    for (const s of addSelectors) {
      globalReplaced.add(s.toLowerCase());
    }

    if (replaceSelectors.length > 0) {
      cut.push([newFacetAddress, FacetCutAction.Replace, replaceSelectors]);
    }

    if (addSelectors.length > 0) {
      cut.push([newFacetAddress, FacetCutAction.Add, addSelectors]);
    }
  }

  // Write to file
  const cutParams = { cutParams: cut };
  fs.writeFileSync(`./${jsonFileName}.json`, JSON.stringify(cutParams, null, 4));

  console.log("Cut params generated:");
  console.log("Note: New FacetBase selectors should be manually assigned to their respective setter facets.");
  return cutParams;
}

generateCutParams()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
