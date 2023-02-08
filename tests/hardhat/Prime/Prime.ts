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
  Prime,
  VBep20Harness,
  XVS,
  XVSStore,
  XVSVault,
  XVSVaultScenario,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
export const bigNumber16 = BigNumber.from("10000000000000000"); // 1e16

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
  prime: Prime
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
    
  //0.2 reserve factor
  await veth._setReserveFactor(bigNumber16.mul(20))
  await vusdt._setReserveFactor(bigNumber16.mul(20))

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
  const poolId = 0;
  const rewardPerBlock = bigNumber18.mul(1);
  await xvsVault.add(xvs.address, allocPoint, xvs.address, rewardPerBlock, lockPeriod);
  
  const primeFactory = await ethers.getContractFactory("Prime");
  const prime: Prime = (await primeFactory.deploy(
    xvsVault.address
  )) as Prime;
  prime.initialize()

  await xvsVault.setPrimeToken(
    prime.address,
    xvs.address,
    poolId
  )

  await prime.setLimit(
    1000,
    1000
  )

  await prime.setThresholds(
    [
      bigNumber18.mul(1000),
      bigNumber18.mul(5000),
      bigNumber18.mul(10000),
      bigNumber18.mul(50000),
      bigNumber18.mul(100000),
    ]
  )

  await prime.addMarket(
    vusdt.address,
    [
      bigNumber18.mul("50000"),
      bigNumber18.mul("250000"),
      bigNumber18.mul("1000000"),
      bigNumber18.mul("5000000"),
      bigNumber18.mul("10000000"),
    ],
    [
      bigNumber18.mul("100000"),
      bigNumber18.mul("500000"),
      bigNumber18.mul("2000000"),
      bigNumber18.mul("10000000"),
      bigNumber18.mul("20000000"),
    ]
  )

  await prime.addMarket(
    veth.address,
    [
      bigNumber18.mul("5"),
      bigNumber18.mul("25"),
      bigNumber18.mul("100"),
      bigNumber18.mul("500"),
      bigNumber18.mul("1000"),
    ],
    [
      bigNumber18.mul("10"),
      bigNumber18.mul("50"),
      bigNumber18.mul("200"),
      bigNumber18.mul("1000"),
      bigNumber18.mul("2000"),
    ]
  )

  await vusdt._setPrimeToken(prime.address);
  await veth._setPrimeToken(prime.address);

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
    xvsStore,
    prime
  };
}

describe("Prime Token", () => {
  let root: Signer;
  let accounts: Signer[];

  before(async () => {
    [root, ...accounts] = await ethers.getSigners();
  });

  describe("protocol setup", () => {
    let comptroller: MockContract<Comptroller>;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;

    beforeEach(async () => {
      ({comptroller, vusdt, veth, usdt, eth} = await loadFixture(deployProtocol));

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

  describe.skip("mint and burn", () => {
    let comptroller: MockContract<Comptroller>;
    let prime: Prime
    let xvsVault: XVSVault
    let xvs: XVS

    beforeEach(async () => {
      ({comptroller, prime, xvsVault, xvs} = await loadFixture(deployProtocol));
    });

    it("stake and mint", async () => {
      const user = accounts[0]

      await expect(prime.connect(user).claim()).to.be.revertedWith("you are not eligible to claim prime token");

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000))
      
      let stake = await prime._stakes(user.getAddress());
      expect(stake.tier).be.equal(3);

      await expect(prime.connect(user).claim()).to.be.revertedWith("you need to wait more time for claiming prime token");

      await mine(90* 24 * 60 * 60);
      await expect(prime.connect(user).claim()).to.be.not.reverted;

      stake = await prime._stakes(user.getAddress());
      expect(stake.tier).be.equal(0);

      let token = await  prime._tokens(user.getAddress())
      expect(token.isIrrevocable).to.be.equal(false)
      expect(token.tier).to.be.equal(3)
    })

    it("stake and unstake", async () => {
      const user = accounts[0]

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000))
      
      let stake = await prime._stakes(user.getAddress());
      expect(stake.tier).be.equal(3);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(1))
      stake = await prime._stakes(user.getAddress());
      expect(stake.tier).be.equal(0);
    })

    it("downgrade and burn", async () => {
      const user = accounts[0]

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000))
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000))
      await mine(90* 24 * 60 * 60);
      await prime.connect(user).claim()

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000))
      
      let token = await prime._tokens(user.getAddress())
      expect(token.tier).to.be.equal(2)

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000))
      token = await prime._tokens(user.getAddress())
      expect(token.tier).to.be.equal(0)
    })

    it("claim and upgrade", async () => {
      const user = accounts[0]

      await expect(prime.connect(user).claim()).to.be.revertedWith("you are not eligible to claim prime token");

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000))
      
      await mine(90* 24 * 60 * 60);
      await prime.connect(user).claim()

      let token = await  prime._tokens(user.getAddress())
      expect(token.isIrrevocable).to.be.equal(false)
      expect(token.tier).to.be.equal(3)

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(40000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(40000))

      await mine(90* 24 * 60 * 60);
      await prime.connect(user).upgrade()

      token = await prime._tokens(user.getAddress())
      expect(token.isIrrevocable).to.be.equal(false)
      expect(token.tier).to.be.equal(4)
    })

    it("issue", async () => {
      const [user1, user2, user3, user4] = accounts

      await expect(prime.connect(user1).issue(false, [user1.getAddress()], [2])).to.be.revertedWith("Ownable: caller is not the owner");

      await prime.issue(true, [
        user1.getAddress(), user2.getAddress()
      ], [3, 4])

      let token = await  prime._tokens(user1.getAddress())
      expect(token.isIrrevocable).to.be.equal(true)
      expect(token.tier).to.be.equal(5)

      token = await  prime._tokens(user2.getAddress())
      expect(token.isIrrevocable).to.be.equal(true)
      expect(token.tier).to.be.equal(5)

      await prime.issue(false, [
        user3.getAddress(), user4.getAddress()
      ], [3, 4])

      token = await  prime._tokens(user3.getAddress())
      expect(token.isIrrevocable).to.be.equal(false)
      expect(token.tier).to.be.equal(3)

      token = await  prime._tokens(user4.getAddress())
      expect(token.isIrrevocable).to.be.equal(false)
      expect(token.tier).to.be.equal(4)
    })
  })

  describe("boosted yield", () => {
    let comptroller: MockContract<Comptroller>;
    let prime: Prime
    let xvsVault: XVSVault
    let xvs: XVS
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;

    beforeEach(async () => {
      ({comptroller, prime, xvsVault, xvs, vusdt, veth, usdt, eth} = await loadFixture(deployProtocol));

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
    });

    it("user supplied/borrowed, prime market is added and accrue interest after minting ", async () => {
      const [user1, user2] = accounts
      
      await prime.executeBoost(user1.getAddress(), vusdt.address)
      
      let interest = await prime._interests(vusdt.address, user1.getAddress())
      expect(interest.totalQVL).to.be.equal(0)

      await prime.issue(true, [
        user1.getAddress(), user2.getAddress()
      ], [1, 1])

      interest = await prime._interests(vusdt.address, user1.getAddress())
      expect(interest.totalQVL).to.be.equal(bigNumber18.mul(5))
      expect(interest.index).to.be.equal(bigNumber18.mul(1))
      expect(interest.accrued).to.be.equal(0)

      interest = await prime._interests(veth.address, user1.getAddress())
      expect(interest.totalQVL).to.be.equal(bigNumber18.mul(90))

      let market = await prime._markets(vusdt.address)
      expect(market.totalQVL).to.be.equal(bigNumber18.mul(9005))

      await mine(24 * 60 * 20);
      await prime.executeBoost(user1.getAddress(), vusdt.address)

      interest = await prime._interests(vusdt.address, user1.getAddress())

      /**
       * incomePerBlock * totalBlocks / totalQVL = 18 * 28800 / 9005000000000000000000 = 57
       */
      expect(interest.index).to.be.equal(BigNumber.from("1000000000000000057"))

      /**
       * accrued = index * qvl = 57 * 5 = 285
       */
      expect(interest.accrued).to.be.equal("285")
    })
  })
});