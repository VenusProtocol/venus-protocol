import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer, BigNumber } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  BEP20Harness,
  Comptroller,
  ComptrollerLens,
  ComptrollerLens__factory,
  Comptroller__factory,
  IAccessControlManager,
  InterestRateModelHarness,
  PriceOracle,
  VBep20Harness,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

type SetupProtocolFixture = {
  oracle: FakeContract<PriceOracle>;
  accessControl: FakeContract<IAccessControlManager>;
  comptrollerLens: MockContract<ComptrollerLens>;
  comptroller: MockContract<Comptroller>;
  usdt: BEP20Harness;
  vusdt: VBep20Harness;
  eth: BEP20Harness;
  veth: VBep20Harness;
  xvsVault: XVSVaultScenario;
  xvs: XVS;
  xvsStore: XVSStore;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [wallet, ...accounts] = await ethers.getSigners();

  const oracle = await smock.fake<PriceOracle>("PriceOracle");
  const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await ComptrollerFactory.deploy();
  const comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(convertToUnit("1", 18));

  const tokenFactory = await ethers.getContractFactory("BEP20Harness");
  const usdt = (await tokenFactory.deploy(
    bigNumber18.mul(100000000),
    "usdt",
    BigNumber.from(18),
    "BEP20 usdt",
  )) as BEP20Harness;

  const eth = (await tokenFactory.deploy(
    bigNumber18.mul(100000000),
    "eth",
    BigNumber.from(18),
    "BEP20 eth",
  )) as BEP20Harness;

  const interestRateModelHarnessFactory = await ethers.getContractFactory("InterestRateModelHarness");
  const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(
    BigNumber.from(18).mul(5),
  )) as InterestRateModelHarness;

  const vTokenFactory = await ethers.getContractFactory("VBep20Harness");
  const vusdt = (await vTokenFactory.deploy(
    usdt.address,
    comptroller.address,
    InterestRateModelHarness.address,
    bigNumber18,
    "VToken usdt",
    "vusdt",
    BigNumber.from(18),
    wallet.address,
  )) as VBep20Harness;
  const veth = (await vTokenFactory.deploy(
    eth.address,
    comptroller.address,
    InterestRateModelHarness.address,
    bigNumber18,
    "VToken eth",
    "veth",
    BigNumber.from(18),
    wallet.address,
  )) as VBep20Harness;

  oracle.getUnderlyingPrice.returns((vToken: string) => {
    if (vToken == vusdt.address) {
      return convertToUnit(1, 18);
    } else if (vToken == veth.address) {
      return convertToUnit(1200, 18)
    }
  });

  const half = convertToUnit("0.5", 18);
  await comptroller._supportMarket(vusdt.address);
  await comptroller._setCollateralFactor(vusdt.address, half)
  await comptroller._supportMarket(veth.address);
  await comptroller._setCollateralFactor(veth.address, half)

  eth.transfer(accounts[0].address, bigNumber18.mul(100))
  usdt.transfer(accounts[1].address, bigNumber18.mul(10000))
  
  await comptroller._setMarketSupplyCaps([
    vusdt.address,
    veth.address
  ], [
    bigNumber18.mul(10000),
    bigNumber18.mul(100)
  ])

  await comptroller._setMarketBorrowCaps([
    vusdt.address,
    veth.address
  ], [
    bigNumber18.mul(10000),
    bigNumber18.mul(100)
  ])

  await eth.connect(accounts[0]).approve(veth.address, bigNumber18.mul(90));
  await veth.connect(accounts[0]).mint(bigNumber18.mul(90));

  await usdt.connect(accounts[1]).approve(vusdt.address, bigNumber18.mul(9000));
  await vusdt.connect(accounts[1]).mint(bigNumber18.mul(9000));

  await comptroller.connect(accounts[0]).enterMarkets([
    vusdt.address,
    veth.address
  ])

  await comptroller.connect(accounts[1]).enterMarkets([
    vusdt.address,
    veth.address
  ])

  await vusdt.connect(accounts[0]).borrow(bigNumber18.mul(5))
  await veth.connect(accounts[1]).borrow(bigNumber18.mul(1))

  const xvsFactory = await ethers.getContractFactory("XVS");
  const xvs: XVS = (await xvsFactory.deploy(wallet.address)) as XVS;

  const xvsStoreFactory = await ethers.getContractFactory("XVSStore");
  const xvsStore: XVSStore = (await xvsStoreFactory.deploy()) as XVSStore;

  const xvsVaultFactory = await ethers.getContractFactory("XVSVaultScenario");
  const xvsVault: XVSVaultScenario = (await xvsVaultFactory.deploy()) as XVSVaultScenario;

  await xvsStore.setNewOwner(xvsVault.address);
  await xvsVault.setXvsStore(xvs.address, xvsStore.address);

  await xvs.transfer(xvsStore.address, bigNumber18.mul(1000));
  await xvs.transfer(accounts[0].address, bigNumber18.mul(1000000));
  await xvs.transfer(accounts[1].address, bigNumber18.mul(1000000));

  await xvsStore.setRewardToken(xvs.address, true);

  const lockPeriod = 300;
  const allocPoint = 100;
  const rewardPerBlock = bigNumber18.mul(1);
  await xvsVault.add(xvs.address, allocPoint, xvs.address, rewardPerBlock, lockPeriod);

  return { 
    oracle, 
    comptroller, 
    comptrollerLens, 
    accessControl,
    usdt,
    vusdt,
    eth,
    veth,
    xvsVault,
    xvs,
    xvsStore
  };
}

describe("Prime Token", () => {
  let root: Signer;
  let accounts: Signer[];

  before(async () => {
    [root, ...accounts] = await ethers.getSigners();
  });

  describe("protocol and xvs setup", () => {
    let comptroller: MockContract<Comptroller>;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;

    beforeEach(async () => {
      ({comptroller, vusdt, veth, usdt, eth} = await loadFixture(deployProtocol));
    });

    it("markets added", async () => {
      expect((await comptroller.allMarkets(0))).to.be.equal(vusdt.address)
      expect((await comptroller.allMarkets(1))).to.be.equal(veth.address)
    })

    it("borrow balance", async () => {
      expect((await usdt.balanceOf(accounts[0].getAddress()))).to.be.gt(0)
      expect((await eth.balanceOf(accounts[1].getAddress()))).to.be.gt(0)
    })
  })
});
