import { expect } from "chai";
import { ethers } from "hardhat";

import { FacetCutAction, getSelectors } from "../../../../script/deploy/comptroller/diamond";

describe("Comptroller", async () => {
  let diamond;
  let unitroller;
  let unitrollerAdmin;
  let facetCutParams;
  let diamondHarness;
  let facet;

  before(async () => {
    const UnitrollerFactory = await ethers.getContractFactory("Unitroller");
    unitroller = await UnitrollerFactory.deploy();
    const signer = await ethers.getSigners();
    unitrollerAdmin = signer[0];

    const diamondFactory = await ethers.getContractFactory("DiamondHarness");
    diamond = await diamondFactory.deploy();

    await unitroller.connect(unitrollerAdmin)._setPendingImplementation(diamond.address);
    await diamond.connect(unitrollerAdmin)._become(unitroller.address);

    const Facet = await ethers.getContractFactory("MarketFacet");
    facet = await Facet.deploy();
    await facet.deployed();

    const FacetInterface = await ethers.getContractAt("IMarketFacet", facet.address);

    diamondHarness = await ethers.getContractAt("DiamondHarnessInterface", unitroller.address);
    facetCutParams = [
      {
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(FacetInterface),
      },
    ];
  });

  it("Revert on check for the function selector", async () => {
    await expect(diamondHarness.getFacetAddress("0xa76b3fda")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0x929fe9a1")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xc2998238")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xede4edd0")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xabfceffc")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0x007e3dd2")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xc488847b")).to.be.revertedWith("Diamond: Function does not exist");
  });

  it("Add Facet and function selectors to proxy", async () => {
    await diamondHarness.connect(unitrollerAdmin).diamondCut(facetCutParams);

    expect(await diamondHarness.getFacetAddress("0xa76b3fda")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0x929fe9a1")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xc2998238")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xede4edd0")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xabfceffc")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0x007e3dd2")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xc488847b")).to.equal(facet.address);
  });

  it("Get all facet function selectors by facet address", async () => {
    const functionSelectors = await diamondHarness.facetFunctionSelectors(facetCutParams[0].facetAddress);
    expect(functionSelectors).to.deep.equal(facetCutParams[0].functionSelectors);
  });

  it("Get facet position by facet address", async () => {
    const facetPosition = await diamondHarness.facetPosition(facetCutParams[0].facetAddress);
    expect(facetPosition).to.equal(0);
  });

  it("Get all facet addresses", async () => {
    const facetsAddress = await diamondHarness.facetAddresses();
    expect(facetsAddress[0]).to.equal(facetCutParams[0].facetAddress);
  });

  it("Get all facets address and their selectors", async () => {
    const facets = await diamondHarness.facets();
    expect(facets[0].facetAddress).to.equal(facetCutParams[0].facetAddress);
  });

  it("Get facet address and position by function selector", async () => {
    const facetsAddressAndPosition = await diamondHarness.facetAddress(facetCutParams[0].functionSelectors[1]);
    expect(facetsAddressAndPosition.facetAddress).to.equal(facetCutParams[0].facetAddress);
    expect(facetsAddressAndPosition.functionSelectorPosition).to.equal(1);
  });

  it("Remove function selector from facet mapping", async () => {
    facetCutParams = [
      {
        facetAddress: ethers.constants.AddressZero,
        action: FacetCutAction.Remove,
        functionSelectors: ["0xa76b3fda", "0x929fe9a1"],
      },
    ];
    await diamondHarness.connect(unitrollerAdmin).diamondCut(facetCutParams);

    await expect(diamondHarness.getFacetAddress("0xa76b3fda")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0x929fe9a1")).to.be.revertedWith("Diamond: Function does not exist");
    expect(await diamondHarness.getFacetAddress("0xc2998238")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xede4edd0")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xabfceffc")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0x007e3dd2")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xc488847b")).to.equal(facet.address);
  });

  it("Replace the function from facet mapping", async () => {
    const Facet = await ethers.getContractFactory("PolicyFacet");
    const newFacet = await Facet.deploy();
    await newFacet.deployed();

    facetCutParams = [
      {
        facetAddress: newFacet.address,
        action: FacetCutAction.Replace,
        functionSelectors: ["0xc2998238", "0xede4edd0", "0xabfceffc"],
      },
    ];
    await diamondHarness.connect(unitrollerAdmin).diamondCut(facetCutParams);

    await expect(diamondHarness.getFacetAddress("0xa76b3fda")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0x929fe9a1")).to.be.revertedWith("Diamond: Function does not exist");
    expect(await diamondHarness.getFacetAddress("0xc2998238")).to.equal(newFacet.address);
    expect(await diamondHarness.getFacetAddress("0xede4edd0")).to.equal(newFacet.address);
    expect(await diamondHarness.getFacetAddress("0xabfceffc")).to.equal(newFacet.address);
    expect(await diamondHarness.getFacetAddress("0x007e3dd2")).to.equal(facet.address);
    expect(await diamondHarness.getFacetAddress("0xc488847b")).to.equal(facet.address);
  });

  it("Remove all functions", async () => {
    facetCutParams = [
      {
        facetAddress: ethers.constants.AddressZero,
        action: FacetCutAction.Remove,
        functionSelectors: ["0xc2998238", "0xede4edd0", "0xabfceffc", "0x007e3dd2", "0xc488847b"],
      },
    ];
    await diamondHarness.connect(unitrollerAdmin).diamondCut(facetCutParams);

    await expect(diamondHarness.getFacetAddress("0xa76b3fda")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0x929fe9a1")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xc2998238")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xede4edd0")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xabfceffc")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0x007e3dd2")).to.be.revertedWith("Diamond: Function does not exist");
    await expect(diamondHarness.getFacetAddress("0xc488847b")).to.be.revertedWith("Diamond: Function does not exist");
  });
});
