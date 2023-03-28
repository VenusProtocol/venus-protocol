const hre = require("hardhat");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

require("dotenv").config();

const { Unitroller__factory } = require("../../typechain");
const { getSelectors, FacetCutAction } = require("./diamond.js");
const ethers = hre.ethers;

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";

async function deployDiamond(unitrollerAddress) {
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];
  let unitroller;
  let unitrollerAdmin;

  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await DiamondCutFacet.deploy();
  await diamondCutFacet.deployed();

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

  // deploy Diamond
  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(contractOwner.address, unitroller.address);
  await diamond.deployed();

  await unitroller.connect(unitrollerAdmin)._setPendingImplementation(diamond.address);
  await diamond.connect(unitrollerAdmin)._become();

  const compProxy = await ethers.getContractAt("Diamond", unitroller.address);

  await compProxy.connect(unitrollerAdmin).facetCutInitilizer(diamondCutFacet.address);

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.deployed();

  // deploy facets
  const FacetNames = ["DiamondLoupeFacet", "MarketFacet", "PolicyFacet", "RewardFacet", "SetterFacet"];
  const cut = [];
  let index = 0;
  for (const FacetName of FacetNames) {
    let Facet;

    Facet = await ethers.getContractFactory(FacetName);

    const facet = await Facet.deploy();
    await facet.deployed();
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
    index++;
  }

  // upgrade diamond with facets
  const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);
  let tx;
  let receipt;
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData("init");
  tx = await diamondCut.connect(unitrollerAdmin).diamondCut(cut, diamondInit.address, functionCall);
  receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  return { unitroller, diamond };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deployDiamond;
