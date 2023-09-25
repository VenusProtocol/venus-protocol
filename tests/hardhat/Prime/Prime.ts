import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  BEP20Harness,
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  ComptrollerMock__factory,
  IAccessControlManager,
  IProtocolShareReserve,
  InterestRateModelHarness,
  PrimeLiquidityProvider,
  PrimeLiquidityProvider__factory,
  PrimeScenario,
  ResilientOracleInterface,
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
  oracle: FakeContract<ResilientOracleInterface>;
  accessControl: FakeContract<IAccessControlManager>;
  comptrollerLens: MockContract<ComptrollerLens>;
  comptroller: MockContract<ComptrollerMock>;
  usdt: BEP20Harness;
  vusdt: VBep20Harness;
  eth: BEP20Harness;
  veth: VBep20Harness;
  xvsVault: XVSVaultScenario;
  xvs: XVS;
  xvsStore: XVSStore;
  prime: PrimeScenario;
  protocolShareReserve: FakeContract<IProtocolShareReserve>;
  primeLiquidityProvider: PrimeLiquidityProvider;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [wallet, user1, user2, user3] = await ethers.getSigners();

  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const ComptrollerFactory = await smock.mock<ComptrollerMock__factory>("ComptrollerMock");
  const comptroller = await ComptrollerFactory.deploy();
  const comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(convertToUnit("1", 18));
  await protocolShareReserve.MAX_PERCENT.returns("100");

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

  const wbnb = (await tokenFactory.deploy(
    bigNumber18.mul(100000000),
    "wbnb",
    BigNumber.from(18),
    "BEP20 wbnb",
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
  const vbnb = (await vTokenFactory.deploy(
    wbnb.address,
    comptroller.address,
    InterestRateModelHarness.address,
    bigNumber18,
    "VToken bnb",
    "vbnb",
    BigNumber.from(18),
    wallet.address,
  )) as VBep20Harness;

  //0.2 reserve factor
  await veth._setReserveFactor(bigNumber16.mul(20));
  await vusdt._setReserveFactor(bigNumber16.mul(20));

  oracle.getUnderlyingPrice.returns((vToken: string) => {
    if (vToken == vusdt.address) {
      return convertToUnit(1, 18);
    } else if (vToken == veth.address) {
      return convertToUnit(1200, 18);
    }
  });

  oracle.getPrice.returns((token: string) => {
    if (token == xvs.address) {
      return convertToUnit(3, 18);
    }
  });

  const half = convertToUnit("0.5", 18);
  await comptroller._supportMarket(vusdt.address);
  await comptroller._setCollateralFactor(vusdt.address, half);
  await comptroller._supportMarket(veth.address);
  await comptroller._setCollateralFactor(veth.address, half);

  await eth.transfer(user1.address, bigNumber18.mul(100));
  await usdt.transfer(user2.address, bigNumber18.mul(10000));

  await comptroller._setMarketSupplyCaps([vusdt.address, veth.address], [bigNumber18.mul(10000), bigNumber18.mul(100)]);

  await comptroller._setMarketBorrowCaps([vusdt.address, veth.address], [bigNumber18.mul(10000), bigNumber18.mul(100)]);

  const xvsFactory = await ethers.getContractFactory("XVS");
  const xvs: XVS = (await xvsFactory.deploy(wallet.address)) as XVS;

  const xvsStoreFactory = await ethers.getContractFactory("XVSStore");
  const xvsStore: XVSStore = (await xvsStoreFactory.deploy()) as XVSStore;

  const xvsVaultFactory = await ethers.getContractFactory("XVSVaultScenario");
  const xvsVault: XVSVaultScenario = (await xvsVaultFactory.deploy()) as XVSVaultScenario;

  await xvsStore.setNewOwner(xvsVault.address);
  await xvsVault.setXvsStore(xvs.address, xvsStore.address);
  await xvsVault.setAccessControl(accessControl.address);

  await xvs.transfer(xvsStore.address, bigNumber18.mul(1000));
  await xvs.transfer(user1.address, bigNumber18.mul(1000000));
  await xvs.transfer(user2.address, bigNumber18.mul(1000000));
  await xvs.transfer(user3.address, bigNumber18.mul(1000000));

  await xvsStore.setRewardToken(xvs.address, true);

  const lockPeriod = 300;
  const allocPoint = 100;
  const poolId = 0;
  const rewardPerBlock = bigNumber18.mul(1);
  await xvsVault.add(xvs.address, allocPoint, xvs.address, rewardPerBlock, lockPeriod);

  const primeLiquidityProviderFactory = await ethers.getContractFactory("PrimeLiquidityProvider");
  const primeLiquidityProvider = await upgrades.deployProxy(
    primeLiquidityProviderFactory,
    [accessControl.address, [xvs.address, usdt.address, eth.address], [10, 10, 10]],
    {},
  );

  const primeFactory = await ethers.getContractFactory("PrimeScenario");
  const prime: PrimeScenario = await upgrades.deployProxy(
    primeFactory,
    [
      xvsVault.address,
      xvs.address,
      0,
      1,
      2,
      accessControl.address,
      protocolShareReserve.address,
      primeLiquidityProvider.address,
      comptroller.address,
      oracle.address,
      10,
    ],
    {
      constructorArgs: [wbnb.address, vbnb.address, 10512000],
      unsafeAllow: "constructor",
    },
  );

  await xvsVault.setPrimeToken(prime.address, xvs.address, poolId);

  await prime.setLimit(1000, 1000);

  await prime.addMarket(vusdt.address, bigNumber18.mul("1"), bigNumber18.mul("1"));

  await prime.addMarket(veth.address, bigNumber18.mul("1"), bigNumber18.mul("1"));

  await comptroller._setPrimeToken(prime.address);

  await prime.togglePause();

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
    prime,
    protocolShareReserve,
    primeLiquidityProvider,
  };
}

describe("PrimeScenario Token", () => {
  let deployer: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  before(async () => {
    [deployer, user1, user2, user3] = await ethers.getSigners();
  });

  describe("protocol setup", () => {
    let comptroller: MockContract<ComptrollerMock>;
    let prime: PrimeScenario;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;

    beforeEach(async () => {
      ({ comptroller, vusdt, veth, usdt, eth, prime } = await loadFixture(deployProtocol));

      await eth.connect(user1).approve(veth.address, bigNumber18.mul(90));
      await veth.connect(user1).mint(bigNumber18.mul(90));

      await usdt.connect(user2).approve(vusdt.address, bigNumber18.mul(9000));
      await vusdt.connect(user2).mint(bigNumber18.mul(9000));

      await comptroller.connect(user1).enterMarkets([vusdt.address, veth.address]);
      await comptroller.connect(user2).enterMarkets([vusdt.address, veth.address]);

      await vusdt.connect(user1).borrow(bigNumber18.mul(5));
      await veth.connect(user2).borrow(bigNumber18.mul(1));
    });

    it("markets added", async () => {
      expect(await comptroller.allMarkets(0)).to.be.equal(vusdt.address);
      expect(await comptroller.allMarkets(1)).to.be.equal(veth.address);
    });

    it("borrow balance", async () => {
      expect(await usdt.balanceOf(user1.getAddress())).to.be.gt(0);
      expect(await eth.balanceOf(user2.getAddress())).to.be.gt(0);
    });

    it("get markets in prime", async () => {
      const [market1, market2] = await prime.getAllMarkets();
      expect(market1).to.be.equal(vusdt.address);
      expect(market2).to.be.equal(veth.address);
    });
  });

  describe("mint and burn", () => {
    let prime: PrimeScenario;
    let xvsVault: XVSVault;
    let xvs: XVS;

    beforeEach(async () => {
      ({ prime, xvsVault, xvs } = await loadFixture(deployProtocol));
    });

    it("stake and mint", async () => {
      const user = user1;

      await expect(prime.connect(user).claim()).to.be.revertedWithCustomError(prime, "IneligibleToClaim");

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000));

      let stake = await prime.stakedAt(user.getAddress());
      expect(stake).be.gt(0);

      await expect(prime.connect(user).claim()).to.be.revertedWithCustomError(prime, "WaitMoreTime");
      expect(await prime.claimTimeRemaining(user.getAddress())).to.be.equal(7775999);
      await mine(90 * 24 * 60 * 60);
      await expect(prime.connect(user).claim()).to.be.not.reverted;

      const token = await prime.tokens(user.getAddress());
      expect(token.isIrrevocable).to.be.equal(false);
      expect(token.exists).to.be.equal(true);

      stake = await prime.stakedAt(user.getAddress());
      expect(stake).be.equal(0);
    });

    it("stake and unstake", async () => {
      const user = user1;

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000));

      let stake = await prime.stakedAt(user.getAddress());
      expect(stake).be.gt(0);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(1));

      stake = await prime.stakedAt(user.getAddress());
      expect(stake).be.gt(0);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(9999));
      stake = await prime.stakedAt(user.getAddress());
      expect(stake).be.equal(0);
    });

    it("burn revocable token", async () => {
      const user = user1;

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000));
      await mine(90 * 24 * 60 * 60);
      await prime.connect(user).claim();

      expect(await prime.totalRevocable()).to.be.equal(1);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000));

      let token = await prime.tokens(user.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(false);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000));

      token = await prime.tokens(user.getAddress());
      expect(token.exists).to.be.equal(false);
      expect(token.isIrrevocable).to.be.equal(false);

      expect(await prime.totalRevocable()).to.be.equal(0);
    });

    it("cannot burn irrevocable token", async () => {
      await prime.issue(true, [user1.getAddress(), user2.getAddress()]);

      let token = await prime.tokens(user1.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(true);

      token = await prime.tokens(user2.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);

      await prime.xvsUpdated(user1.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);
    });

    it("manually burn irrevocable token", async () => {
      await prime.issue(true, [user1.getAddress(), user2.getAddress()]);

      let token = await prime.tokens(user1.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(true);

      token = await prime.tokens(user2.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);

      await prime.burn(user1.getAddress());
      token = await prime.tokens(user1.getAddress());
      expect(token.isIrrevocable).to.be.equal(false);
      expect(token.exists).to.be.equal(false);
    });

    it("issue", async () => {
      await prime.issue(true, [user1.getAddress(), user2.getAddress()]);

      let token = await prime.tokens(user1.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(true);

      token = await prime.tokens(user2.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);

      await prime.issue(false, [user3.getAddress()]);

      token = await prime.tokens(user3.getAddress());
      expect(token.isIrrevocable).to.be.equal(false);
      expect(token.exists).to.be.equal(true);
    });

    it("upgrade", async () => {
      await prime.issue(false, [user1.getAddress(), user2.getAddress()]);

      let token = await prime.tokens(user1.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(false);

      token = await prime.tokens(user2.getAddress());
      expect(token.isIrrevocable).to.be.equal(false);
      expect(token.exists).to.be.equal(true);

      await prime.issue(true, [user1.getAddress()]);

      token = await prime.tokens(user1.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);

      token = await prime.tokens(user2.getAddress());
      expect(token.isIrrevocable).to.be.equal(false);
      expect(token.exists).to.be.equal(true);
    });
  });

  describe("boosted yield", () => {
    let comptroller: MockContract<ComptrollerMock>;
    let prime: PrimeScenario;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;
    let xvsVault: XVSVault;
    let xvs: XVS;
    let oracle: FakeContract<ResilientOracleInterface>;
    let protocolShareReserve: FakeContract<IProtocolShareReserve>;
    let primeLiquidityProvider: PrimeLiquidityProvider;

    beforeEach(async () => {
      ({
        comptroller,
        prime,
        vusdt,
        veth,
        usdt,
        eth,
        xvsVault,
        xvs,
        oracle,
        protocolShareReserve,
        primeLiquidityProvider,
      } = await loadFixture(deployProtocol));

      await protocolShareReserve.getUnreleasedFunds.returns("0");
      await protocolShareReserve.getPercentageDistribution.returns("100");

      await xvs.connect(user1).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user1).deposit(xvs.address, 0, bigNumber18.mul(10000));
      await mine(90 * 24 * 60 * 60);
      await prime.connect(user1).claim();

      await xvs.connect(user2).approve(xvsVault.address, bigNumber18.mul(100));
      await xvsVault.connect(user2).deposit(xvs.address, 0, bigNumber18.mul(100));

      await eth.connect(user1).approve(veth.address, bigNumber18.mul(90));
      await veth.connect(user1).mint(bigNumber18.mul(90));

      await usdt.connect(user2).approve(vusdt.address, bigNumber18.mul(9000));
      await vusdt.connect(user2).mint(bigNumber18.mul(9000));

      await comptroller.connect(user1).enterMarkets([vusdt.address, veth.address]);

      await comptroller.connect(user2).enterMarkets([vusdt.address, veth.address]);

      await vusdt.connect(user1).borrow(bigNumber18.mul(5));
      await veth.connect(user2).borrow(bigNumber18.mul(1));
    });

    it("calculate score", async () => {
      const xvsBalance = bigNumber18.mul(5000);
      const capital = bigNumber18.mul(120);

      // 5000^0.5 * 120^1-0.5 = 774.5966692
      expect((await prime.calculateScore(xvsBalance, capital)).toString()).to.be.equal("774596669241483420144");

      await prime.updateAlpha(4, 5); //0.80

      //  5000^0.8 * 120^1-0.8 = 2371.44061
      expect((await prime.calculateScore(xvsBalance, capital)).toString()).to.be.equal("2371440609779311958519");
    });

    it("accrue interest - prime token minted after market is added", async () => {
      let interest = await prime.interests(vusdt.address, user1.getAddress());
      /**
       * score = 10000^0.5 * 5^0.5 = 223.6067977
       */
      expect(interest.score).to.be.equal("223606797749979014552");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal(0);

      let market = await prime.markets(vusdt.address);
      expect(market.sumOfMembersScore).to.be.equal("223606797749979014552");
      expect(market.rewardIndex).to.be.equal(0);

      await protocolShareReserve.getUnreleasedFunds.returns("518436");
      await prime.accrueInterest(vusdt.address);
      market = await prime.markets(vusdt.address);
      expect(market.sumOfMembersScore).to.be.equal("223606797749979014552");
      /**
       * IncomeToDistribute = 518436
       * IndexDelta = IncomeToDistribute/MarketScore = 518436 / 223606797749979014552 = 0.000000000000002318
       * NewIndex += IndexDelta = 2318
       */
      expect(market.rewardIndex).to.be.equal("2318");

      /**
       * index = 2318 - 0
       * score = 223606797749979014552 (223.606797749979014552)
       * interest = index * score = 2318 * 223.606797749979014552 = 518320
       */
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(518320);

      const interestsAccrued = await prime.callStatic.getPendingInterests(user1.getAddress());
      expect(interestsAccrued[0].market).to.be.equal(usdt.address);
      expect(interestsAccrued[1].market).to.be.equal(eth.address);
      expect(interestsAccrued[0].amount).to.be.equal(518320);
      expect(interestsAccrued[1].amount).to.be.equal(518000);

      await prime.issue(false, [user2.getAddress()]);

      interest = await prime.interests(vusdt.address, user2.getAddress());
      /**
       * score = 100^0.5 * 300^0.5 = 173.2050808
       */
      expect(interest.score).to.be.equal("173205080756887726446");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal("2318");
    });

    it("claim interest", async () => {
      await protocolShareReserve.getUnreleasedFunds.returns("518436");
      await prime.accrueInterest(vusdt.address);
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(518320);

      await expect(prime.connect(user1)["claimInterest(address)"](vusdt.address)).to.be.reverted;

      const interest = await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress());
      await usdt.transfer(prime.address, interest);
      const previousBalance = await usdt.balanceOf(user1.getAddress());
      expect(await prime.callStatic["claimInterest(address,address)"](vusdt.address, user1.getAddress())).to.be.equal(
        interest,
      );
      await expect(prime["claimInterest(address,address)"](vusdt.address, user1.getAddress())).to.be.not.reverted;
      const newBalance = await usdt.balanceOf(user1.getAddress());
      expect(newBalance).to.be.equal(previousBalance.add(interest));
    });

    describe("update score", () => {
      let vbnb: VBep20Harness;
      let bnb: BEP20Harness;

      beforeEach(async () => {
        const tokenFactory = await ethers.getContractFactory("BEP20Harness");
        bnb = (await tokenFactory.deploy(
          bigNumber18.mul(100000000),
          "bnb",
          BigNumber.from(18),
          "BEP20 bnb",
        )) as BEP20Harness;

        const interestRateModelHarnessFactory = await ethers.getContractFactory("InterestRateModelHarness");
        const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(
          BigNumber.from(18).mul(5),
        )) as InterestRateModelHarness;

        const vTokenFactory = await ethers.getContractFactory("VBep20Harness");
        vbnb = (await vTokenFactory.deploy(
          bnb.address,
          comptroller.address,
          InterestRateModelHarness.address,
          bigNumber18,
          "VToken bnb",
          "vbnb",
          BigNumber.from(18),
          deployer.getAddress(),
        )) as VBep20Harness;

        await vbnb._setReserveFactor(bigNumber16.mul(20));
        await primeLiquidityProvider.initializeTokens([bnb.address]);

        oracle.getUnderlyingPrice.returns((vToken: string) => {
          if (vToken == vusdt.address) {
            return convertToUnit(1, 18);
          } else if (vToken == veth.address) {
            return convertToUnit(1200, 18);
          } else if (vToken == vbnb.address) {
            return convertToUnit(300, 18);
          }
        });

        oracle.getPrice.returns((token: string) => {
          if (token == xvs.address) {
            return convertToUnit(3, 18);
          }
        });

        const half = convertToUnit("0.5", 8);
        await comptroller._supportMarket(vbnb.address);
        await comptroller._setCollateralFactor(vbnb.address, half);

        bnb.transfer(user3.getAddress(), bigNumber18.mul(100));

        await comptroller._setMarketSupplyCaps([vbnb.address], [bigNumber18.mul(100)]);
        await comptroller._setMarketBorrowCaps([vbnb.address], [bigNumber18.mul(100)]);

        await bnb.connect(user3).approve(vbnb.address, bigNumber18.mul(90));
        await vbnb.connect(user3).mint(bigNumber18.mul(90));

        await vbnb.connect(user2).borrow(bigNumber18.mul(1));

        await comptroller._setPrimeToken(prime.address);
      });

      it("add existing market after issuing prime tokens - update score gradually", async () => {
        await xvs.connect(user3).approve(xvsVault.address, bigNumber18.mul(2000));
        await xvsVault.connect(user3).deposit(xvs.address, 0, bigNumber18.mul(2000));
        await prime.issue(false, [user3.getAddress()]);
        await prime.addMarket(vbnb.address, bigNumber18.mul(1), bigNumber18.mul(1));

        let interest = await prime.interests(vbnb.address, user3.getAddress());
        expect(interest.accrued).to.be.equal(0);
        expect(interest.score).to.be.equal(0);
        expect(interest.rewardIndex).to.be.equal(0);

        let market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(0);
        expect(market.sumOfMembersScore).to.be.equal(0);

        await bnb.connect(user3).approve(vbnb.address, bigNumber18.mul(90));
        await vbnb.connect(user3).mint(bigNumber18.mul(1));

        interest = await prime.interests(vbnb.address, user3.getAddress());
        expect(interest.accrued).to.be.equal(0);
        /**
         * score = 2000^0.5 * 20^0.5 = 200.000000000000029058
         */
        expect(interest.score).to.be.equal("200000000000000029058");
        expect(interest.rewardIndex).to.be.equal(0);

        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(0);
        expect(market.sumOfMembersScore).to.be.equal("200000000000000029058");

        await protocolShareReserve.getUnreleasedFunds.returns(103683);
        await prime.accrueInterest(vbnb.address);
        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));

        /**
         * distributionIncome = 103683
         * rewardIndex += 103687/200000000000000029058 = 518
         */
        expect(market.rewardIndex).to.be.equal(518);
        expect(market.sumOfMembersScore).to.be.equal("200000000000000029058");

        /**
         * index = 463
         * score = 223606797749979014552 (223.606797749979014552)
         * interest = index * score = 463 * 223.606797749979014552 = 103529.9474
         */
        expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(103529);

        await protocolShareReserve.getUnreleasedFunds.returns(103683 * 2);
        await prime.accrueInterest(vbnb.address);
        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(1036);
        expect(market.sumOfMembersScore).to.be.equal("200000000000000029058");

        /**
         * 927 * 223.606797749979014552 = 207283.5015
         */
        expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(207283);
      });

      it("add existing market after issuing prime tokens - update score manually", async () => {
        await xvs.connect(user3).approve(xvsVault.address, bigNumber18.mul(2000));
        await xvsVault.connect(user3).deposit(xvs.address, 0, bigNumber18.mul(2000));
        await prime.issue(false, [user3.getAddress()]);
        await prime.addMarket(vbnb.address, bigNumber18.mul(1), bigNumber18.mul(1));

        let interest = await prime.interests(vbnb.address, user3.getAddress());
        expect(interest.accrued).to.be.equal(0);
        expect(interest.score).to.be.equal(0);
        expect(interest.rewardIndex).to.be.equal(0);

        let market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(0);
        expect(market.sumOfMembersScore).to.be.equal(0);

        let nextScoreUpdateRoundId = await prime.nextScoreUpdateRoundId();
        let totalScoreUpdatesRequired = await prime.totalScoreUpdatesRequired();
        let pendingScoreUpdates = await prime.pendingScoreUpdates();
        let isScoreUpdated = await prime.isScoreUpdated(nextScoreUpdateRoundId, user3.getAddress());
        expect(nextScoreUpdateRoundId).to.be.equal(3);
        expect(totalScoreUpdatesRequired).to.be.equal(2);
        expect(pendingScoreUpdates).to.be.equal(2);
        expect(isScoreUpdated).to.be.equal(false);

        await prime.updateScores([user1.getAddress(), user3.getAddress()]);

        nextScoreUpdateRoundId = await prime.nextScoreUpdateRoundId();
        totalScoreUpdatesRequired = await prime.totalScoreUpdatesRequired();
        pendingScoreUpdates = await prime.pendingScoreUpdates();
        isScoreUpdated = await prime.isScoreUpdated(nextScoreUpdateRoundId, user3.getAddress());
        expect(nextScoreUpdateRoundId).to.be.equal(3);
        expect(totalScoreUpdatesRequired).to.be.equal(2);
        expect(pendingScoreUpdates).to.be.equal(0);
        expect(isScoreUpdated).to.be.equal(true);
        isScoreUpdated = await prime.isScoreUpdated(nextScoreUpdateRoundId, user1.getAddress());
        expect(isScoreUpdated).to.be.equal(true);

        interest = await prime.interests(vbnb.address, user3.getAddress());
        expect(interest.accrued).to.be.equal(0);
        /**
         * score = 2000^0.5 * 90^0.5 = 200.000000000000029058
         */
        expect(interest.score).to.be.equal("200000000000000029058");
        expect(interest.rewardIndex).to.be.equal(0);

        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(0);
        expect(market.sumOfMembersScore).to.be.equal("200000000000000029058");

        await protocolShareReserve.getUnreleasedFunds.returns(103687);
        await prime.accrueInterest(vbnb.address);
        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        /**
         * distributionIncome = 103687
         * rewardIndex += 103687/200000000000000029058 = 518
         */
        expect(market.rewardIndex).to.be.equal(518);
        expect(market.sumOfMembersScore).to.be.equal("200000000000000029058");

        /**
         * interest = index * user score = 463 * 223.606797749979014552 = 103529
         */
        await prime.accrueInterest(vusdt.address);
        expect((await prime.interests(vusdt.address, user1.getAddress())).score).to.be.equal("223606797749979014552");
        expect((await prime.interests(vusdt.address, user1.getAddress())).rewardIndex).to.be.equal("0");
        expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(103529);

        await protocolShareReserve.getUnreleasedFunds.returns(103687 * 2);
        await prime.accrueInterest(vbnb.address);
        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        /**
         * distributionIncome = 207374
         * rewardIndex += 207374/200000000000000029058 = 1036
         */
        expect(market.rewardIndex).to.be.equal(1036);
        expect(market.sumOfMembersScore).to.be.equal("200000000000000029058");

        /**
         * 926 * 223.606797749979014552 = 207059.8947
         */
        expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(207059);
      });
    });

    it("track asset state", async () => {
      await protocolShareReserve.getUnreleasedFunds.returns("518436");
      await prime.accrueInterest(vusdt.address);
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(518320);

      await protocolShareReserve.getUnreleasedFunds.returns(518436 * 2);
      await prime.accrueInterest(vusdt.address);
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(1036641);

      impersonateAccount(protocolShareReserve.address);
      const protocolShareReserveSigner = await ethers.provider.getSigner(protocolShareReserve.address);
      await user1.sendTransaction({ to: protocolShareReserve.address, value: ethers.utils.parseEther("10") });
      await prime.connect(protocolShareReserveSigner).updateAssetsState(comptroller.address, usdt.address);

      await protocolShareReserve.getUnreleasedFunds.returns("518436");
      await prime.accrueInterest(vusdt.address);
      // 1036641 + 518320
      expect(await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress())).to.be.equal(1554961);
    });
  });

  describe("PLP integration", () => {
    let comptroller: MockContract<ComptrollerMock>;
    let prime: PrimeScenario;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let vmatic: VBep20Harness;
    let matic: BEP20Harness;
    let xvsVault: XVSVault;
    let xvs: XVS;
    let oracle: FakeContract<ResilientOracleInterface>;
    let protocolShareReserve: FakeContract<IProtocolShareReserve>;
    let primeLiquidityProvider: PrimeLiquidityProvider;

    beforeEach(async () => {
      const [wallet, user1] = await ethers.getSigners();

      ({ comptroller, prime, vusdt, veth, xvsVault, xvs, oracle, protocolShareReserve, primeLiquidityProvider } =
        await loadFixture(deployProtocol));

      await protocolShareReserve.getUnreleasedFunds.returns("0");
      await protocolShareReserve.getPercentageDistribution.returns("100");
      await primeLiquidityProvider.setPrimeToken(prime.address);

      const tokenFactory = await ethers.getContractFactory("BEP20Harness");
      matic = (await tokenFactory.deploy(
        bigNumber18.mul(100000000),
        "matic",
        BigNumber.from(18),
        "BEP20 MATIC",
      )) as BEP20Harness;

      await primeLiquidityProvider.initializeTokens([matic.address]);
      const interestRateModelHarnessFactory = await ethers.getContractFactory("InterestRateModelHarness");
      const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(
        BigNumber.from(18).mul(5),
      )) as InterestRateModelHarness;

      const vTokenFactory = await ethers.getContractFactory("VBep20Harness");
      vmatic = (await vTokenFactory.deploy(
        matic.address,
        comptroller.address,
        InterestRateModelHarness.address,
        bigNumber18,
        "VToken matic",
        "vmatic",
        BigNumber.from(18),
        wallet.address,
      )) as VBep20Harness;

      const half = convertToUnit("0.5", 18);
      await vmatic._setReserveFactor(bigNumber16.mul(20));
      await comptroller._supportMarket(vmatic.address);

      oracle.getUnderlyingPrice.returns((vToken: string) => {
        if (vToken == vusdt.address) {
          return convertToUnit(1, 18);
        } else if (vToken == veth.address) {
          return convertToUnit(1200, 18);
        } else if (vToken == vmatic.address) {
          return convertToUnit(1, 18);
        }
      });

      await comptroller._setCollateralFactor(vmatic.address, half);

      await comptroller._setMarketSupplyCaps([vmatic.address], [bigNumber18.mul(10000)]);
      await comptroller._setMarketBorrowCaps([vmatic.address], [bigNumber18.mul(10000)]);

      await prime.addMarket(vmatic.address, bigNumber18.mul("1"), bigNumber18.mul("1"));

      await xvs.connect(user1).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user1).deposit(xvs.address, 0, bigNumber18.mul(10000));
      await mine(90 * 24 * 60 * 60);
      await prime.connect(user1).claim();

      await matic.transfer(user1.getAddress(), bigNumber18.mul(90));
      await matic.connect(user1).approve(vmatic.address, bigNumber18.mul(90));
      await vmatic.connect(user1).mint(bigNumber18.mul(90));

      const speed = convertToUnit(1, 18);
      await primeLiquidityProvider.setTokensDistributionSpeed([matic.address], [speed]);
      await matic.transfer(primeLiquidityProvider.address, bigNumber18.mul(10000));
    });

    it("claim interest", async () => {
      let interest = await prime.interests(vmatic.address, user1.getAddress());
      expect(interest.score).to.be.equal("948683298050513937723");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal(0);

      let plpAccrued = await primeLiquidityProvider.tokenAmountAccrued(matic.address);
      expect(plpAccrued).to.be.equal(0);

      await mine(100);
      await primeLiquidityProvider.accrueTokens(matic.address);
      plpAccrued = await primeLiquidityProvider.tokenAmountAccrued(matic.address);
      expect(plpAccrued).to.be.equal(bigNumber18.mul(102)); // (1 * 100) + 2 = 102

      await prime.accrueInterest(vmatic.address);
      interest = await prime.interests(vmatic.address, user1.getAddress());
      expect(interest.score).to.be.equal("948683298050513937723");
      expect(interest.accrued).to.be.equal(0);
      expect(interest.rewardIndex).to.be.equal(0);

      await prime.accrueInterestAndUpdateScore(user1.getAddress(), vmatic.address);

      const market = await prime.markets(vmatic.address);
      // 103000000000000000000 / 948683298050513937723 = 108571532999114341
      // 1000000000000000000 / 948683298050513937723 = 1054092553389459
      // 108571532999114341 + 1054092553389459 = 109625625552503800
      expect(market.rewardIndex).to.be.equal("109625625552503800");

      interest = await prime.interests(vmatic.address, user1.getAddress());
      expect(interest.score).to.be.equal("948683298050513937723");
      //109625625552503800 * 948683298050513937723 = 103999999999999999163
      expect(interest.accrued).to.be.equal("103999999999999999163");
      expect(interest.rewardIndex).to.be.equal("109625625552503800");

      const beforeBalance = await matic.balanceOf(user1.getAddress());
      expect(beforeBalance).to.be.equal(0);
      await prime["claimInterest(address,address)"](vmatic.address, user1.getAddress());
      const afterBalance = await matic.balanceOf(user1.getAddress());
      // 103999999999999999163 + 1000000000000000000 = 104999999999999998571
      expect(afterBalance).to.be.equal("104999999999999998571");
    });

    it("APR Estimation", async () => {
      const apr = await prime.calculateAPR(vmatic.address, user1.getAddress());
      expect(apr.supplyAPR.toString()).to.be.equal("1168000000");
    });

    it("Hypothetical APR Estimation", async () => {
      let apr = await prime.estimateAPR(
        vmatic.address,
        user1.getAddress(),
        bigNumber18.mul(100),
        bigNumber18.mul(100),
        bigNumber18.mul(1000000),
      );
      expect(apr.supplyAPR.toString()).to.be.equal("525600000");
      expect(apr.borrowAPR.toString()).to.be.equal("525600000");

      apr = await prime.estimateAPR(
        vmatic.address,
        user1.getAddress(),
        bigNumber18.mul(100),
        bigNumber18.mul(50),
        bigNumber18.mul(1000000),
      );
      expect(apr.supplyAPR.toString()).to.be.equal("700800000");
      expect(apr.borrowAPR.toString()).to.be.equal("700800000");

      apr = await prime.estimateAPR(
        vmatic.address,
        user1.getAddress(),
        bigNumber18.mul(100),
        bigNumber18.mul(0),
        bigNumber18.mul(1000000),
      );
      expect(apr.supplyAPR.toString()).to.be.equal("0");
      expect(apr.borrowAPR.toString()).to.be.equal("1051200000");
    });
  });
});
