import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
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
  InterestRateModelHarness,
  MockProtocolShareReserve,
  Prime,
  PrimeLiquidityProvider,
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
  prime: Prime;
  primeLiquidityProvider: PrimeLiquidityProvider;
  protocolShareReserve: MockProtocolShareReserve;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [wallet, user1, user2, user3] = await ethers.getSigners();

  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
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

  const PrimeLiquidityProviderFactory = await ethers.getContractFactory("PrimeLiquidityProvider");
  const primeLiquidityProvider = await upgrades.deployProxy(PrimeLiquidityProviderFactory, [
    accessControl.address,
    [usdt.address, eth.address, wbnb.address],
    [convertToUnit("1", 16), convertToUnit("1", 16), convertToUnit("1", 16)],
  ]);

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

  const protocolShareReserveFactory = await ethers.getContractFactory("MockProtocolShareReserve");
  const protocolShareReserve = await upgrades.deployProxy(protocolShareReserveFactory, [accessControl.address, 100], {
    Contract: protocolShareReserveFactory,
    initializer: "initialize",
    unsafeAllow: "constructor",
    constructorArgs: [comptroller.address, wbnb.address, vbnb.address],
  });

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

  await comptroller._setMarketSupplyCaps(
    [vusdt.address, veth.address],
    [bigNumber18.mul(100000), bigNumber18.mul(1000)],
  );

  await comptroller._setMarketBorrowCaps(
    [vusdt.address, veth.address],
    [bigNumber18.mul(100000), bigNumber18.mul(1000)],
  );

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

  const primeFactory = await ethers.getContractFactory("Prime");
  const prime: Prime = await upgrades.deployProxy(
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
    },
  );

  await protocolShareReserve.setPrime(prime.address);

  await primeLiquidityProvider.setPrimeToken(prime.address);

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
    primeLiquidityProvider,
    protocolShareReserve,
  };
}

describe("Prime Token", () => {
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  before(async () => {
    [, user1, user2, user3] = await ethers.getSigners();
  });

  describe("mint and burn", () => {
    let prime: Prime;
    let xvsVault: XVSVault;
    let xvs: XVS;

    beforeEach(async () => {
      ({ prime, xvsVault, xvs } = await loadFixture(deployProtocol));
    });

    it("stake and mint", async () => {
      await expect(prime.connect(user1).claim()).to.be.revertedWithCustomError(prime, "IneligibleToClaim");

      await xvs.connect(user1).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user1).deposit(xvs.address, 0, bigNumber18.mul(10000));

      let stake = await prime.stakedAt(user1.getAddress());
      expect(stake).be.gt(0);

      await expect(prime.connect(user1).claim()).to.be.revertedWithCustomError(prime, "WaitMoreTime");
      expect(await prime.claimTimeRemaining(user1.getAddress())).to.be.equal(7775999);
      await mine(90 * 24 * 60 * 60);
      await expect(prime.connect(user1).claim()).to.be.not.reverted;

      const token = await prime.tokens(user1.getAddress());
      expect(token.isIrrevocable).to.be.equal(false);
      expect(token.exists).to.be.equal(true);

      stake = await prime.stakedAt(user1.getAddress());
      expect(stake).be.equal(0);

      await expect(prime.connect(user2).claim()).to.be.revertedWithCustomError(prime, "IneligibleToClaim");

      await xvs.connect(user2).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user2).deposit(xvs.address, 0, bigNumber18.mul(10000));

      stake = await prime.stakedAt(user2.getAddress());
      expect(stake).be.gt(0);

      expect(await prime.claimTimeRemaining(user2.getAddress())).to.greaterThan(0);

      await mine(90 * 24 * 60 * 60);
      expect(await prime.claimTimeRemaining(user2.getAddress())).to.be.equal(0);
    });

    it("burn revocable token", async () => {
      const user = user1;

      await xvs.connect(user).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user).deposit(xvs.address, 0, bigNumber18.mul(10000));

      await xvs.connect(user2).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user2).deposit(xvs.address, 0, bigNumber18.mul(10000));

      await mine(90 * 24 * 60 * 60);
      await prime.connect(user).claim();
      expect(await prime.totalRevocable()).to.be.equal(1);

      await prime.connect(user2).claim();

      expect(await prime.totalRevocable()).to.be.equal(2);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000));

      let token = await prime.tokens(user.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(false);

      await xvsVault.connect(user).requestWithdrawal(xvs.address, 0, bigNumber18.mul(5000));

      token = await prime.tokens(user.getAddress());
      expect(token.exists).to.be.equal(false);
      expect(token.isIrrevocable).to.be.equal(false);

      expect(await prime.totalRevocable()).to.be.equal(1);
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
      token = await prime.tokens(user1.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);

      await prime.xvsUpdated(user2.getAddress());
      token = await prime.tokens(user2.getAddress());
      expect(token.isIrrevocable).to.be.equal(true);
      expect(token.exists).to.be.equal(true);
    });

    it("issue and stake token concurrently", async () => {
      await prime.issue(true, [user1.getAddress(), user2.getAddress()]);

      const token = await prime.tokens(user1.getAddress());
      expect(token.exists).to.be.equal(true);
      expect(token.isIrrevocable).to.be.equal(true);

      await xvs.connect(user1).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user1).deposit(xvs.address, 0, bigNumber18.mul(10000));
      await mine(90 * 24 * 60 * 60);

      await expect(prime.connect(user1).claim()).to.be.revertedWithCustomError(prime, "IneligibleToClaim");
    });
  });

  describe("boosted yield", () => {
    let comptroller: MockContract<ComptrollerMock>;
    let prime: Prime;
    let vusdt: VBep20Harness;
    let veth: VBep20Harness;
    let usdt: BEP20Harness;
    let eth: BEP20Harness;
    let xvsVault: XVSVault;
    let xvs: XVS;
    let protocolShareReserve: MockProtocolShareReserve;
    let primeLiquidityProvider: PrimeLiquidityProvider;

    beforeEach(async () => {
      ({ comptroller, prime, vusdt, veth, usdt, eth, xvsVault, xvs, primeLiquidityProvider, protocolShareReserve } =
        await loadFixture(deployProtocol));

      const DistributionConfig1 = {
        schema: 1,
        percentage: 100,
        destination: prime.address,
      };
      await protocolShareReserve.addOrUpdateDistributionConfigs([DistributionConfig1]);

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

    it("claim interest for multiple users", async () => {
      let interestForUser1ForUsdt = await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress());
      let interestForUser1ForEth = await prime.callStatic.getInterestAccrued(veth.address, user1.getAddress());

      expect(interestForUser1ForEth).to.be.equal(0);
      expect(interestForUser1ForUsdt).to.be.equal(0);

      // Transferring funds to PSR
      await usdt.transfer(protocolShareReserve.address, convertToUnit("1", 6));
      await eth.transfer(protocolShareReserve.address, convertToUnit("1", 6));

      await protocolShareReserve.updateAssetsState(comptroller.address, usdt.address, 0);
      await protocolShareReserve.updateAssetsState(comptroller.address, eth.address, 0);

      interestForUser1ForUsdt = await prime.callStatic.getInterestAccrued(vusdt.address, user1.getAddress());
      interestForUser1ForEth = await prime.callStatic.getInterestAccrued(veth.address, user1.getAddress());

      expect(interestForUser1ForEth).to.gt(0);
      expect(interestForUser1ForUsdt).to.gt(0);

      // providing some liquidity to PLP
      await usdt.transfer(primeLiquidityProvider.address, convertToUnit("1", 6));
      await eth.transfer(primeLiquidityProvider.address, convertToUnit("1", 6));

      const interestForUser1ForEthIncludingPlp = await prime.callStatic.getInterestAccrued(
        vusdt.address,
        user1.getAddress(),
      );
      const interestForUser1ForUsdtIncludingPlp = await prime.callStatic.getInterestAccrued(
        veth.address,
        user1.getAddress(),
      );
      expect(interestForUser1ForEthIncludingPlp).to.gt(interestForUser1ForEth);
      expect(interestForUser1ForUsdtIncludingPlp).to.gt(interestForUser1ForUsdt);

      const previousBalanceOfUser1ForUsdt = await usdt.balanceOf(user1.getAddress());
      const previousBalanceOfUser1ForEth = await eth.balanceOf(user1.getAddress());

      await prime.connect(user1)["claimInterest(address)"](vusdt.address);
      await prime.connect(user1)["claimInterest(address)"](veth.address);

      expect(await usdt.balanceOf(user1.getAddress())).to.be.closeTo(
        previousBalanceOfUser1ForUsdt.add(interestForUser1ForUsdtIncludingPlp),
        convertToUnit("1", 3),
      );
      expect(await eth.balanceOf(user1.getAddress())).to.closeTo(
        previousBalanceOfUser1ForEth.add(interestForUser1ForEthIncludingPlp),
        convertToUnit("1", 3),
      );

      // Making two other users get the prime token
      await xvs.connect(user2).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user2).deposit(xvs.address, 0, bigNumber18.mul(10000));

      await xvs.connect(user3).approve(xvsVault.address, bigNumber18.mul(10000));
      await xvsVault.connect(user3).deposit(xvs.address, 0, bigNumber18.mul(10000));

      await mine(90 * 24 * 60 * 60);

      await prime.connect(user2).claim();
      await prime.connect(user3).claim();

      // Minting and borrowing by user3
      await usdt.transfer(user3.getAddress(), convertToUnit("10000", 18));
      await usdt.connect(user3).approve(vusdt.address, bigNumber18.mul(9000));
      await vusdt.connect(user3).mint(bigNumber18.mul(9000));

      await comptroller.connect(user3).enterMarkets([vusdt.address, veth.address]);

      await veth.connect(user3).borrow(bigNumber18.mul(1));

      let interestForUser2ForUsdt = await prime.callStatic.getInterestAccrued(vusdt.address, user2.getAddress());
      let interestForUser2ForEth = await prime.callStatic.getInterestAccrued(veth.address, user2.getAddress());
      let interestForUser3ForUsdt = await prime.callStatic.getInterestAccrued(vusdt.address, user3.getAddress());
      let interestForUser3ForEth = await prime.callStatic.getInterestAccrued(veth.address, user3.getAddress());

      expect(interestForUser2ForUsdt).to.be.equal(0);
      expect(interestForUser2ForEth).to.be.equal(0);
      expect(interestForUser3ForUsdt).to.be.equal(0);
      expect(interestForUser3ForEth).to.be.equal(0);

      // Transfering funds to primeLiquidityProvider
      await usdt.transfer(primeLiquidityProvider.address, convertToUnit("1", 10));
      await eth.transfer(primeLiquidityProvider.address, convertToUnit("1", 10));

      // Providing funds to PSR
      await usdt.transfer(protocolShareReserve.address, convertToUnit("1", 18));
      await eth.transfer(protocolShareReserve.address, convertToUnit("1", 18));

      await protocolShareReserve.updateAssetsState(comptroller.address, usdt.address, 0);
      await protocolShareReserve.updateAssetsState(comptroller.address, eth.address, 0);

      interestForUser2ForUsdt = await prime.callStatic.getInterestAccrued(vusdt.address, user2.getAddress());
      interestForUser2ForEth = await prime.callStatic.getInterestAccrued(veth.address, user2.getAddress());
      interestForUser3ForUsdt = await prime.callStatic.getInterestAccrued(vusdt.address, user3.getAddress());
      interestForUser3ForEth = await prime.callStatic.getInterestAccrued(veth.address, user3.getAddress());

      const previousBalanceOfUser2ForUsdt = await usdt.balanceOf(user2.getAddress());
      const previousBalanceOfUser2ForEth = await eth.balanceOf(user2.getAddress());
      const previousBalanceOfUser3ForUsdt = await usdt.balanceOf(user3.getAddress());
      const previousBalanceOfUser3ForEth = await eth.balanceOf(user3.getAddress());

      await prime.connect(user2)["claimInterest(address)"](vusdt.address);
      await prime.connect(user2)["claimInterest(address)"](veth.address);

      expect(await usdt.balanceOf(user2.getAddress())).to.be.equal(
        previousBalanceOfUser2ForUsdt.add(interestForUser2ForUsdt),
      );
      expect(await eth.balanceOf(user2.getAddress())).to.be.equal(
        previousBalanceOfUser2ForEth.add(interestForUser2ForEth),
      );

      await prime.connect(user3)["claimInterest(address)"](vusdt.address);
      await prime.connect(user3)["claimInterest(address)"](veth.address);

      expect(await usdt.balanceOf(user3.getAddress())).to.be.equal(
        previousBalanceOfUser3ForUsdt.add(interestForUser3ForUsdt),
      );
      expect(await eth.balanceOf(user3.getAddress())).to.be.equal(
        previousBalanceOfUser3ForEth.add(interestForUser3ForEth),
      );

      // As some time has been passed so balance of user1 would also have increased so user1 will also be able to claim interest
      await prime.connect(user1)["claimInterest(address)"](vusdt.address);
      await prime.connect(user1)["claimInterest(address)"](veth.address);
    });
  });
});
