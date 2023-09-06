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
  PriceOracle,
  PrimeLiquidityProvider,
  PrimeScenario,
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
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [wallet, user1, user2, user3] = await ethers.getSigners();

  const oracle = await smock.fake<PriceOracle>("PriceOracle");
  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  const primeLiquidityProvider = await smock.fake<PrimeLiquidityProvider>("PrimeLiquidityProvider");
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
    ],
    {
      constructorArgs: [wbnb.address, vbnb.address, 10512000],
    },
  );

  await xvsVault.setPrimeToken(prime.address, xvs.address, poolId);

  await prime.setLimit(1000, 1000);

  await prime.addMarket(vusdt.address, bigNumber18.mul("1"), bigNumber18.mul("1"));

  await prime.addMarket(veth.address, bigNumber18.mul("1"), bigNumber18.mul("1"));

  await comptroller._setPrimeToken(prime.address);

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
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;

    beforeEach(async () => {
      ({ comptroller, vusdt, veth, usdt, eth } = await loadFixture(deployProtocol));

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

      expect(await prime._totalRevocable()).to.be.equal(1);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000));

      let token = await prime.tokens(user.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(false);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000));

      token = await prime.tokens(user.getAddress());
      expect(token.exists).to.be.equal(false);
      expect(token.isIrrevocable).to.be.equal(false);

      expect(await prime._totalRevocable()).to.be.equal(0);
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
    let oracle: FakeContract<PriceOracle>;
    let protocolShareReserve: FakeContract<IProtocolShareReserve>;

    beforeEach(async () => {
      ({ comptroller, prime, vusdt, veth, usdt, eth, xvsVault, xvs, oracle, protocolShareReserve } = await loadFixture(
        deployProtocol,
      ));

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

      await prime.issue(false, [user2.getAddress()]);

      interest = await prime.interests(vusdt.address, user2.getAddress());
      /**
       * score = 100^0.5 * 100^0.5 = 100
       */
      expect(interest.score).to.be.equal(bigNumber18.mul(100));
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

        oracle.getUnderlyingPrice.returns((vToken: string) => {
          if (vToken == vusdt.address) {
            return convertToUnit(1, 18);
          } else if (vToken == veth.address) {
            return convertToUnit(1200, 18);
          } else if (vToken == vbnb.address) {
            return convertToUnit(300, 18);
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
         * score = 2000^0.5 * 91^0.5 = 426.6145802
         */
        expect(interest.score).to.be.equal("426614580154030858642");
        expect(interest.rewardIndex).to.be.equal(0);

        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(0);
        expect(market.sumOfMembersScore).to.be.equal("426614580154030858642");

        await protocolShareReserve.getUnreleasedFunds.returns(103683);
        await prime.accrueInterest(vbnb.address);
        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));

        /**
         * distributionIncome = 103683
         * rewardIndex += 103687/426614580154030858642 = 243
         */
        expect(market.rewardIndex).to.be.equal(243);
        expect(market.sumOfMembersScore).to.be.equal("426614580154030858642");

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
        expect(market.rewardIndex).to.be.equal(486);
        expect(market.sumOfMembersScore).to.be.equal("426614580154030858642");

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
         * score = 2000^0.5 * 90^0.5 = 424.2640687
         */
        expect(interest.score).to.be.equal("424264068711928538075");
        expect(interest.rewardIndex).to.be.equal(0);

        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.rewardIndex).to.be.equal(0);
        expect(market.sumOfMembersScore).to.be.equal("424264068711928538075");

        await protocolShareReserve.getUnreleasedFunds.returns(103687);
        await prime.accrueInterest(vbnb.address);
        market = await prime.markets(vbnb.address);
        expect(market.supplyMultiplier).to.be.equal(bigNumber18.mul(1));
        expect(market.borrowMultiplier).to.be.equal(bigNumber18.mul(1));
        /**
         * distributionIncome = 103687
         * rewardIndex += 103687/424264068711928538075 = 244
         */
        expect(market.rewardIndex).to.be.equal(244);
        expect(market.sumOfMembersScore).to.be.equal("424264068711928538075");

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
         * rewardIndex += 207374/424264068711928538075 = 488
         */
        expect(market.rewardIndex).to.be.equal(488);
        expect(market.sumOfMembersScore).to.be.equal("424264068711928538075");

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
});
