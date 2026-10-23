import fs from "fs";
import { deployments, ethers, network } from "hardhat";

import { FacetCutAction, getSelectors } from "./diamond";

/**
 * This script is used to generate the cut-params which will be used in diamond proxy vip
 * to add diamond facets
 */

type FacetName = "MarketFacet" | "PolicyFacet" | "RewardFacet" | "SetterFacet" | "FlashLoanFacet" | "FacetBase";
type CutEntry = [string, number, string[]];

// One entry of what `Diamond.facets()` returns: an on-chain facet and the selectors it serves.
type DeployedFacet = { facetAddress: string; functionSelectors: string[] };

type DiffChange = {
  selector: string;
  signature: string;
  facet: FacetName;
  oldAddress?: string;
  newAddress: string;
};

type DiffRemoved = {
  selector: string;
  signature: string;
  oldAddress: string;
  oldFacet?: FacetName;
};

// FacetBase is a base contract whose selectors are inlined into the other facets. Each
// IFacetBase selector is routed to whichever concrete facet currently owns it on-chain so
// it rides along in that facet's cut entry. Anything not currently attached to a known
// facet falls into this placeholder for manual reassignment before submitting the cut.
const FACETBASE_PLACEHOLDER = "*FacetBase";

// Interfaces used to derive function selectors for each facet.
const FacetsInterfaces: Record<FacetName, string> = {
  MarketFacet: "IMarketFacet",
  PolicyFacet: "IPolicyFacet",
  RewardFacet: "IRewardFacet",
  SetterFacet: "ISetterFacet",
  FlashLoanFacet: "IFlashLoanFacet",
  FacetBase: "IFacetBase",
};

// Order matters: earlier facets claim shared selectors (inlined FacetBase methods) first.
const FacetNames = Object.keys(FacetsInterfaces) as FacetName[];

const jsonFileName = `cut-params-${network.name}`;

async function fetchContractName(address: string, chainId: number, apiKey: string): Promise<string> {
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  const delays = [500, 1500, 4500];
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { result?: Array<{ ContractName?: string }> };
      const name = json.result?.[0]?.ContractName;
      if (!name) throw new Error("no contract name in response");
      return name;
    } catch (e) {
      lastError = e as Error;
      if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error(`failed to get contract name for ${address}: ${lastError?.message}`);
}

/**
 * Resolve new facet addresses from hardhat-deploy artifacts (just-deployed). FacetBase
 * has no on-chain instance, so it stays as the manual-reassignment placeholder.
 */
async function resolveNewFacetAddresses(): Promise<Map<FacetName, string>> {
  const newFacetAddresses = new Map<FacetName, string>();
  for (const facetName of FacetNames) {
    if (facetName === "FacetBase") {
      newFacetAddresses.set(facetName, FACETBASE_PLACEHOLDER);
      continue;
    }
    const dep = await deployments.get(facetName);
    newFacetAddresses.set(facetName, dep.address);
  }
  return newFacetAddresses;
}

/** Map every currently-deployed selector to the facet address that owns it. */
function mapSelectorsToCurrentFacets(currentFacets: DeployedFacet[]): Map<string, string> {
  const selectorToCurrentFacet = new Map<string, string>();
  for (const f of currentFacets) {
    for (const sel of f.functionSelectors) {
      selectorToCurrentFacet.set(sel.toLowerCase(), f.facetAddress);
    }
  }
  return selectorToCurrentFacet;
}

/**
 * Resolve the new selectors for each facet from its interface, and build a
 * selector → "fnName(types)" map so the diff file can show what each selector is.
 */
async function resolveNewSelectors(newFacetAddresses: Map<FacetName, string>): Promise<{
  newSelectorsByFacet: Map<FacetName, string[]>;
  signatureBySelector: Map<string, string>;
}> {
  const newSelectorsByFacet = new Map<FacetName, string[]>();
  const signatureBySelector = new Map<string, string>();
  for (const facetName of FacetNames) {
    const addr = newFacetAddresses.get(facetName)!;
    const ifaceAddress = addr === FACETBASE_PLACEHOLDER ? ethers.constants.AddressZero : addr;
    const iface = await ethers.getContractAt(FacetsInterfaces[facetName], ifaceAddress);
    const selectors = (getSelectors(iface) as string[]).map(s => s.toLowerCase());
    newSelectorsByFacet.set(facetName, selectors);
    for (const sig of Object.keys(iface.interface.functions)) {
      if (sig === "init(bytes)") continue;
      const sel = iface.interface.getSighash(sig).toLowerCase();
      if (!signatureBySelector.has(sel)) signatureBySelector.set(sel, sig);
    }
  }
  return { newSelectorsByFacet, signatureBySelector };
}

/**
 * Identify which currently-deployed facet backs each new facet by querying Etherscan v2
 * for the verified ContractName at each on-chain address. Addresses whose verified name
 * is not one of our facets are ignored, so they are neither upgraded nor removed.
 */
async function identifyOldFacets(
  currentFacets: DeployedFacet[],
  chainId: number,
  apiKey: string,
): Promise<{
  oldFacetAddressByName: Map<FacetName, string>;
  oldFacetNameByAddress: Map<string, FacetName>;
}> {
  const knownFacetNames = new Set<string>(FacetNames);
  const oldFacetAddressByName = new Map<FacetName, string>();
  const oldFacetNameByAddress = new Map<string, FacetName>();
  for (const f of currentFacets) {
    const name = await fetchContractName(f.facetAddress, chainId, apiKey);
    if (knownFacetNames.has(name)) {
      const fname = name as FacetName;
      oldFacetAddressByName.set(fname, f.facetAddress);
      oldFacetNameByAddress.set(f.facetAddress, fname);
    }
  }
  return { oldFacetAddressByName, oldFacetNameByAddress };
}

/**
 * Redistribute IFacetBase selectors to whichever concrete facet currently owns them
 * on-chain. Inherited selectors get attached to the deployed contract's address (not
 * FacetBase, which has no on-chain instance), so we follow that same attribution.
 * Mutates `newSelectorsByFacet` in place, leaving unattributable selectors on FacetBase.
 */
function redistributeFacetBaseSelectors(
  newSelectorsByFacet: Map<FacetName, string[]>,
  selectorToCurrentFacet: Map<string, string>,
  oldFacetNameByAddress: Map<string, FacetName>,
): void {
  const facetBaseSelectors = newSelectorsByFacet.get("FacetBase") ?? [];
  const remainingFacetBaseSelectors: string[] = [];
  for (const sel of facetBaseSelectors) {
    const currentOwner = selectorToCurrentFacet.get(sel);
    const currentOwnerFacet = currentOwner ? oldFacetNameByAddress.get(currentOwner) : undefined;
    if (currentOwnerFacet && currentOwnerFacet !== "FacetBase") {
      const list = newSelectorsByFacet.get(currentOwnerFacet)!;
      if (!list.includes(sel)) list.push(sel);
    } else {
      remainingFacetBaseSelectors.push(sel);
    }
  }
  newSelectorsByFacet.set("FacetBase", remainingFacetBaseSelectors);
}

/**
 * Build the Add and Replace entries of the cut. A selector already on-chain is Replaced,
 * one that is not is Added. Each selector may appear in at most one cut entry, so later
 * facets defer to earlier ones — which is why the order of `FacetNames` matters.
 *
 * Returns `claimedInCut` alongside the entries so the caller can work out which
 * currently-deployed selectors were left behind and therefore need removing.
 */
function buildCutEntries(
  newFacetAddresses: Map<FacetName, string>,
  newSelectorsByFacet: Map<FacetName, string[]>,
  selectorToCurrentFacet: Map<string, string>,
  signatureBySelector: Map<string, string>,
): { cut: CutEntry[]; claimedInCut: Set<string>; added: DiffChange[]; replaced: DiffChange[] } {
  const cut: CutEntry[] = [];
  const claimedInCut = new Set<string>();
  const added: DiffChange[] = [];
  const replaced: DiffChange[] = [];

  for (const facetName of FacetNames) {
    const newFacetAddress = newFacetAddresses.get(facetName)!;
    const newSelectors = newSelectorsByFacet.get(facetName)!;

    const replaceSelectors: string[] = [];
    const addSelectors: string[] = [];
    for (const sel of newSelectors) {
      if (claimedInCut.has(sel)) continue;
      claimedInCut.add(sel);
      const signature = signatureBySelector.get(sel) ?? "unknown";
      const oldAddress = selectorToCurrentFacet.get(sel);
      if (oldAddress) {
        replaceSelectors.push(sel);
        replaced.push({ selector: sel, signature, facet: facetName, oldAddress, newAddress: newFacetAddress });
      } else {
        addSelectors.push(sel);
        added.push({ selector: sel, signature, facet: facetName, newAddress: newFacetAddress });
      }
    }

    if (replaceSelectors.length > 0) {
      cut.push([newFacetAddress, FacetCutAction.Replace, replaceSelectors]);
    }
    if (addSelectors.length > 0) {
      cut.push([newFacetAddress, FacetCutAction.Add, addSelectors]);
    }
  }

  return { cut, claimedInCut, added, replaced };
}

/**
 * Selectors that live on an old version of an upgraded facet but are absent from the
 * new layout must be Removed, otherwise diamondCut would leave them dangling.
 */
function collectRemovals(
  currentFacets: DeployedFacet[],
  oldFacetAddressByName: Map<FacetName, string>,
  oldFacetNameByAddress: Map<string, FacetName>,
  claimedInCut: Set<string>,
  signatureBySelector: Map<string, string>,
): { removeSelectors: string[]; removed: DiffRemoved[] } {
  const oldUpgradedAddresses = new Set(oldFacetAddressByName.values());
  const removeSelectors: string[] = [];
  const removed: DiffRemoved[] = [];
  for (const f of currentFacets) {
    if (!oldUpgradedAddresses.has(f.facetAddress)) continue;
    for (const sel of f.functionSelectors) {
      const s = sel.toLowerCase();
      if (claimedInCut.has(s)) continue;
      removeSelectors.push(s);
      removed.push({
        selector: s,
        signature: signatureBySelector.get(s) ?? "unknown",
        oldAddress: f.facetAddress,
        oldFacet: oldFacetNameByAddress.get(f.facetAddress),
      });
    }
  }
  return { removeSelectors, removed };
}

/** Write the cut params and the human-readable diff of what the cut changes. */
function writeOutputFiles(cut: CutEntry[], added: DiffChange[], replaced: DiffChange[], removed: DiffRemoved[]) {
  const cutParams = { cutParams: cut };
  fs.writeFileSync(`./${jsonFileName}.json`, JSON.stringify(cutParams, null, 4));

  const diff = {
    summary: {
      added: added.length,
      replaced: replaced.length,
      removed: removed.length,
    },
    added,
    replaced,
    removed,
  };
  const diffFileName = `cut-diff-${network.name}`;
  fs.writeFileSync(`./${diffFileName}.json`, JSON.stringify(diff, null, 4));

  console.log("Cut params generated:");
  console.log(`  - ${jsonFileName}.json`);
  console.log(`  - ${diffFileName}.json (added=${added.length} replaced=${replaced.length} removed=${removed.length})`);
  console.log("Note: New FacetBase selectors should be manually assigned to their respective setter facets.");
  return cutParams;
}

async function generateCutParams() {
  const comptrollerDeployment = await deployments.get("Unitroller");
  const diamondAddress = comptrollerDeployment.address;
  const diamond = await ethers.getContractAt("Diamond", diamondAddress);
  const currentFacets = (await diamond.facets()) as DeployedFacet[];

  const newFacetAddresses = await resolveNewFacetAddresses();
  const selectorToCurrentFacet = mapSelectorsToCurrentFacets(currentFacets);
  const { newSelectorsByFacet, signatureBySelector } = await resolveNewSelectors(newFacetAddresses);

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY env var is required");
  const chainId = network.config.chainId;
  if (!chainId) throw new Error(`network.config.chainId is not set for network "${network.name}"`);
  const { oldFacetAddressByName, oldFacetNameByAddress } = await identifyOldFacets(currentFacets, chainId, apiKey);

  redistributeFacetBaseSelectors(newSelectorsByFacet, selectorToCurrentFacet, oldFacetNameByAddress);

  const { cut, claimedInCut, added, replaced } = buildCutEntries(
    newFacetAddresses,
    newSelectorsByFacet,
    selectorToCurrentFacet,
    signatureBySelector,
  );

  const { removeSelectors, removed } = collectRemovals(
    currentFacets,
    oldFacetAddressByName,
    oldFacetNameByAddress,
    claimedInCut,
    signatureBySelector,
  );
  if (removeSelectors.length > 0) {
    cut.push([ethers.constants.AddressZero, FacetCutAction.Remove, removeSelectors]);
  }

  return writeOutputFiles(cut, added, replaced, removed);
}

generateCutParams()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
