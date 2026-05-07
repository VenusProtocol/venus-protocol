import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import hre from "hardhat";

import { FacetCutAction, getSelectors } from "../../../../../script/deploy/comptroller/diamond";
import { Unitroller__factory } from "../../../../../typechain";

require("dotenv").config();

const ethers = hre.ethers;

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";

export async function deployFacets() {
  // deploy Diamond
  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy();
  await diamond.deployed();

  // deploy facets
  const FacetNames = ["MarketFacet", "PolicyFacet", "RewardFacet", "SetterFacet", "FlashLoanFacet"];
  const cut: any = [];
  let rewardFacetAddress = "";

  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.deployed();

    if (FacetName === "RewardFacet") {
      rewardFacetAddress = facet.address;
    }

    const FacetInterface = await ethers.getContractAt(`I${FacetName}`, facet.address);

    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(FacetInterface),
    });
  }

  // IFacetBase selectors are inlined into every facet (each inherits FacetBase) but must be
  // registered exactly once on the diamond. Route them through RewardFacet's address to match
  // how they used to be picked up via `IRewardFacet is IFacetBase` (before param generator script change).
  const FacetBaseInterface = await ethers.getContractAt("IFacetBase", rewardFacetAddress);
  cut.push({
    facetAddress: rewardFacetAddress,
    action: FacetCutAction.Add,
    functionSelectors: getSelectors(FacetBaseInterface),
  });

  return {
    diamond,
    cut,
  };
}

export async function deployDiamond(unitrollerAddress) {
  let unitroller;
  let unitrollerAdmin;

  if (unitrollerAddress != "") {
    await impersonateAccount(Owner);
    unitrollerAdmin = await ethers.getSigner(Owner);
    unitroller = await Unitroller__factory.connect(unitrollerAddress, unitrollerAdmin);
  } else {
    const UnitrollerFactory = await ethers.getContractFactory("Unitroller");
    unitroller = await UnitrollerFactory.deploy();
    const signer = await ethers.getSigners();
    unitrollerAdmin = signer[0];
  }

  const { diamond, cut } = await deployFacets();
  await unitroller.connect(unitrollerAdmin)._setPendingImplementation(diamond.address);
  await diamond.connect(unitrollerAdmin)._become(unitroller.address);

  // upgrade diamond with facets
  const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);

  const tx = await diamondCut.connect(unitrollerAdmin).diamondCut(cut);
  const receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }

  return { unitroller, diamond, cut };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond("")
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
