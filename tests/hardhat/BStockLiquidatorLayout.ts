import { expect } from "chai";
import * as fs from "fs";
import hre, { ethers, upgrades } from "hardhat";
import * as path from "path";

// ============================================================================================
// BStockLiquidator — storage layout regression
// ============================================================================================
//
// The contract is live behind a transparent proxy on bscmainnet, so its layout is append-only
// forever. `isAllowedComptroller` and `coreFlashSource` were added by shrinking the trailing
// `__gap` from [49] to [47]; inserting them anywhere earlier would have shifted `isRouter` and
// `routerSpender` on top of live state.
//
// Two independent checks:
//   1. The compiled layout matches the exact slot map below (catches an insertion or a reorder).
//   2. The prefix is identical to the layout RECORDED FOR THE DEPLOYED IMPLEMENTATION, and the
//      gap arithmetic balances, so the total footprint is unchanged.

const SRC = "contracts/BStock/BStockLiquidator.sol";
const DEPLOYMENT = "deployments/bscmainnet/BStockLiquidator_Implementation.json";

// slot, label, type — everything the contract owns, in order. Slots 0..200 come from the OZ bases.
const EXPECTED: [number, string, string][] = [
  [0, "_initialized", "uint8"],
  [0, "_initializing", "bool"],
  [1, "__gap", "uint256[50]"],
  [51, "_owner", "address"],
  [52, "__gap", "uint256[49]"],
  [101, "_pendingOwner", "address"],
  [102, "__gap", "uint256[49]"],
  [151, "_status", "uint256"],
  [152, "__gap", "uint256[49]"],
  [201, "isOperator", "mapping(address => bool)"],
  [202, "isRouter", "mapping(address => bool)"],
  [203, "routerSpender", "mapping(address => address)"],
  [204, "isAllowedComptroller", "mapping(address => bool)"],
  [205, "coreFlashSource", "mapping(address => contract IVBep20)"],
  [206, "__gap", "uint256[47]"],
];

const LAST_SLOT = 252; // 206 + 47 - 1; must never move

interface Entry {
  slot: number;
  offset: number;
  label: string;
  type: string;
}

function flatten(layout: any): Entry[] {
  return layout.storage.map((s: any) => ({
    slot: Number(s.slot),
    offset: Number(s.offset),
    label: s.label,
    type: layout.types[s.type].label,
  }));
}

async function compiledLayout(): Promise<Entry[]> {
  const buildInfo = await hre.artifacts.getBuildInfo(`${SRC}:BStockLiquidator`);
  if (!buildInfo) throw new Error("no build info for BStockLiquidator");
  const out = (buildInfo.output.contracts as any)[SRC].BStockLiquidator;
  if (!out.storageLayout) throw new Error("storageLayout missing — enable outputSelection storageLayout");
  return flatten(out.storageLayout);
}

function deployedLayout(): Entry[] | null {
  const p = path.join(hre.config.paths.root, DEPLOYMENT);
  if (!fs.existsSync(p)) return null;
  const dep = JSON.parse(fs.readFileSync(p, "utf8"));
  return dep.storageLayout ? flatten(dep.storageLayout) : null;
}

function arrayLen(type: string): number {
  const m = type.match(/\[(\d+)\]$/);
  return m ? Number(m[1]) : 1;
}

describe("BStockLiquidator — storage layout", () => {
  it("matches the expected slot map exactly", async () => {
    const actual = await compiledLayout();
    expect(actual.map(e => [e.slot, e.label, e.type])).to.deep.equal(EXPECTED);
  });

  it("keeps the two new mappings APPENDED after routerSpender, never inserted", async () => {
    const actual = await compiledLayout();
    const idx = (label: string) => actual.findIndex(e => e.label === label);
    expect(idx("isAllowedComptroller")).to.be.greaterThan(idx("routerSpender"));
    expect(idx("coreFlashSource")).to.be.greaterThan(idx("isAllowedComptroller"));
    // ...and the trailing gap is still last, so nothing can sit past the reserved region.
    expect(actual[actual.length - 1].label).to.equal("__gap");
  });

  it("ends the reserved region at the same slot as before", async () => {
    const actual = await compiledLayout();
    const gap = actual[actual.length - 1];
    expect(gap.slot + arrayLen(gap.type) - 1).to.equal(LAST_SLOT);
  });

  it("is prefix-identical to the layout recorded for the DEPLOYED implementation", async () => {
    const dep = deployedLayout();
    if (dep === null) {
      // Nothing to compare against on a fresh clone; the checks above still bind the layout.
      return;
    }
    const actual = await compiledLayout();
    const prefix = dep.length - 1; // everything before the deployed trailing __gap

    for (let i = 0; i < prefix; i++) {
      expect(actual[i], `entry ${i}`).to.deep.equal(dep[i]);
    }

    // The appended entries fill exactly the slots the old gap started at, and the gap shrinks by
    // the same count — so the total footprint is unchanged.
    const oldGap = dep[dep.length - 1];
    const newGap = actual[actual.length - 1];
    const appended = actual.slice(prefix, actual.length - 1);

    appended.forEach((e, i) => expect(e.slot).to.equal(oldGap.slot + i));
    expect(newGap.slot).to.equal(oldGap.slot + appended.length);
    expect(arrayLen(oldGap.type) - arrayLen(newGap.type)).to.equal(appended.length);
    expect(newGap.slot + arrayLen(newGap.type) - 1).to.equal(oldGap.slot + arrayLen(oldGap.type) - 1);
  });

  it("stays inside the EIP-170 runtime limit", async function () {
    // solidity-coverage instruments every branch into the runtime, which roughly doubles it. The
    // measurement only means anything against an uninstrumented build, so skip under coverage.
    if ((hre as any).__SOLIDITY_COVERAGE_RUNNING) {
      this.skip();
    }
    const buildInfo = await hre.artifacts.getBuildInfo(`${SRC}:BStockLiquidator`);
    const out = (buildInfo!.output.contracts as any)[SRC].BStockLiquidator;
    const size = out.evm.deployedBytecode.object.replace(/^0x/, "").length / 2;
    expect(size).to.be.lessThan(24576);
  });

  it("the new mappings read as empty on a freshly initialized proxy", async () => {
    const [owner] = await ethers.getSigners();
    const wbnb = await (await ethers.getContractFactory("WBNB")).deploy();
    const core = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    const vWBNB = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(wbnb.address, core.address);
    const VBNB = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

    const Factory = await ethers.getContractFactory("BStockLiquidator");
    const liq = await upgrades.deployProxy(Factory, [owner.address], {
      constructorArgs: [core.address, VBNB, vWBNB.address, wbnb.address],
      unsafeAllow: ["constructor", "state-variable-immutable"],
    });

    expect(await liq.isAllowedComptroller(core.address)).to.equal(false);
    expect(await liq.coreFlashSource(wbnb.address)).to.equal(ethers.constants.AddressZero);
    // The pre-existing surface is untouched.
    expect(await liq.owner()).to.equal(owner.address);
    expect(await liq.isOperator(owner.address)).to.equal(false);
    expect(await liq.isRouter(owner.address)).to.equal(false);
    expect(await liq.routerSpender(owner.address)).to.equal(ethers.constants.AddressZero);
  });
});
