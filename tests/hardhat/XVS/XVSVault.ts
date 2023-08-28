import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, Wallet } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { IERC20Upgradeable, XVS, XVSStore, XVSVaultScenario, XVSVaultScenario__factory } from "../../../typechain";
import { IAccessControlManager } from "../../../typechain/contracts/Governance";

const rewardPerBlock = parseUnits("1", 18);
const lockPeriod = 300;
const allocPoint = 100;
const poolId = 0;

interface XVSVaultFixture {
  xvsVault: MockContract<XVSVaultScenario>;
  xvs: XVS;
  accessControl: FakeContract<IAccessControlManager>;
  xvsStore: XVSStore;
}

describe("XVSVault", async () => {
  let deployer: Wallet;
  let user: Wallet;
  let xvsVault: MockContract<XVSVaultScenario>;
  let xvs: XVS;
  let accessControl: FakeContract<IAccessControlManager>;
  let xvsStore: XVSStore;

  before("get signers", async () => {
    [deployer, user] = await (ethers as any).getSigners();
  });

  async function deployXVSVaultFixture(): Promise<XVSVaultFixture> {
    const xvsFactory = await ethers.getContractFactory("XVS");
    xvs = (await xvsFactory.deploy(deployer.address)) as XVS;

    const xvsStoreFactory = await ethers.getContractFactory("XVSStore");
    xvsStore = (await xvsStoreFactory.deploy()) as XVSStore;

    const xvsVaultFactory = await smock.mock<XVSVaultScenario__factory>("XVSVaultScenario");
    xvsVault = await xvsVaultFactory.deploy();

    const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
    accessControl.isAllowedToCall.returns(true);
    await xvsVault.connect(deployer).setAccessControl(accessControl.address);

    return { xvsVault, accessControl, xvs, xvsStore };
  }

  beforeEach("deploy and configure XVSVault contracts", async () => {
    ({ xvsVault, xvs, accessControl, xvsStore } = await loadFixture(deployXVSVaultFixture));

    await xvsStore.setNewOwner(xvsVault.address);
    await xvsVault.setXvsStore(xvs.address, xvsStore.address);
    await xvs.connect(deployer).transfer(user.address, parseUnits("1000", 18));

    await xvsStore.setRewardToken(xvs.address, true);

    await xvsVault.add(xvs.address, allocPoint, xvs.address, rewardPerBlock, lockPeriod);
  });

  describe("setXvsStore", async () => {
    it("fails if XVS is a zero address", async () => {
      ({ xvsVault, xvsStore } = await loadFixture(deployXVSVaultFixture));
      await expect(xvsVault.setXvsStore(ethers.constants.AddressZero, xvsStore.address)).to.be.revertedWith(
        "zero address not allowed",
      );
    });

    it("fails if XVSStore is a zero address", async () => {
      ({ xvsVault, xvs } = await loadFixture(deployXVSVaultFixture));
      await expect(xvsVault.setXvsStore(xvs.address, ethers.constants.AddressZero)).to.be.revertedWith(
        "zero address not allowed",
      );
    });

    it("fails if the vault is already initialized", async () => {
      await expect(xvsVault.setXvsStore(xvs.address, xvsStore.address)).to.be.revertedWith("already initialized");
    });
  });

  describe("add", async () => {
    let token: FakeContract<IERC20Upgradeable>;
    let poolParams: [string, BigNumberish, string, BigNumberish, BigNumberish];

    beforeEach(async () => {
      token = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
      poolParams = [token.address, 100, token.address, rewardPerBlock, lockPeriod];
    });

    it("reverts if ACM does not allow the call", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(xvsVault.add(...poolParams)).to.be.revertedWith("Unauthorized");
      accessControl.isAllowedToCall.returns(true);
    });

    it("reverts if xvsStore is not set", async () => {
      await xvsVault.setVariable("xvsStore", ethers.constants.AddressZero);
      await expect(xvsVault.add(...poolParams)).to.be.revertedWith("Store contract address is empty");
    });

    it("reverts if a pool with this (staked token, reward token) combination already exists", async () => {
      await expect(xvsVault.add(xvs.address, 100, xvs.address, rewardPerBlock, lockPeriod)).to.be.revertedWith(
        "Pool already added",
      );
    });

    it("reverts if staked token exists in another pool", async () => {
      await expect(xvsVault.add(token.address, 100, xvs.address, rewardPerBlock, lockPeriod)).to.be.revertedWith(
        "Token exists in other pool",
      );
    });

    it("reverts if reward token is a zero address", async () => {
      await expect(
        xvsVault.add(ethers.constants.AddressZero, 100, xvs.address, rewardPerBlock, lockPeriod),
      ).to.be.revertedWith("zero address not allowed");
    });

    it("reverts if staked token is a zero address", async () => {
      await expect(
        xvsVault.add(xvs.address, 100, ethers.constants.AddressZero, rewardPerBlock, lockPeriod),
      ).to.be.revertedWith("zero address not allowed");
    });

    it("reverts if alloc points parameter is zero", async () => {
      await expect(xvsVault.add(xvs.address, 0, token.address, rewardPerBlock, lockPeriod)).to.be.revertedWith(
        "Alloc points must not be zero",
      );
    });

    it("emits PoolAdded event", async () => {
      const tx = await xvsVault.add(token.address, 100, token.address, rewardPerBlock, lockPeriod);
      await expect(tx)
        .to.emit(xvsVault, "PoolAdded")
        .withArgs(token.address, 0, token.address, 100, rewardPerBlock, lockPeriod);
    });

    it("adds a second pool to an existing rewardToken", async () => {
      const tx = await xvsVault.add(xvs.address, 100, token.address, rewardPerBlock, lockPeriod);
      const expectedPoolId = 1;
      await expect(tx)
        .to.emit(xvsVault, "PoolAdded")
        .withArgs(xvs.address, expectedPoolId, token.address, 100, rewardPerBlock, lockPeriod);
    });

    it("sets pool info", async () => {
      await xvsVault.add(token.address, 100, token.address, rewardPerBlock, lockPeriod);

      const poolInfo = await xvsVault.poolInfos(token.address, 0);
      expect(poolInfo.token).to.equal(token.address);
      expect(poolInfo.allocPoint).to.equal("100");
      expect(poolInfo.accRewardPerShare).to.equal("0");
      expect(poolInfo.lockPeriod).to.equal(lockPeriod);
    });

    it("configures reward token in XVSStore", async () => {
      await xvsVault.add(token.address, 100, token.address, rewardPerBlock, lockPeriod);
      expect(await xvsStore.rewardTokens(token.address)).to.equal(true);
    });
  });

  describe("set", async () => {
    it("reverts if ACM does not allow the call", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(xvsVault.set(xvs.address, 0, 100)).to.be.revertedWith("Unauthorized");
      accessControl.isAllowedToCall.returns(true);
    });

    it("reverts if pool is not found", async () => {
      await expect(xvsVault.set(xvs.address, 100, 100)).to.be.revertedWith("vault: pool exists?");
    });

    it("reverts if total alloc points after the call is zero", async () => {
      await expect(xvsVault.set(xvs.address, 0, 0)).to.be.revertedWith(
        "Alloc points per reward token must not be zero",
      );
    });

    it("succeeds if the pool alloc points is zero but total alloc points is nonzero", async () => {
      const token = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
      // Adding a new pool with 99 alloc points, reward per block is unchanged
      await xvsVault.add(xvs.address, 99, token.address, rewardPerBlock, lockPeriod);
      await expect(xvsVault.set(xvs.address, 0, 0)).to.not.be.reverted;
      expect(await xvsVault.totalAllocPoints(xvs.address)).to.equal(99);
      const poolInfo = await xvsVault.poolInfos(xvs.address, 0);
      expect(poolInfo.allocPoint).to.equal(0);
    });

    it("emits PoolUpdated event", async () => {
      const tx = await xvsVault.set(xvs.address, 0, 1000);
      await expect(tx).to.emit(xvsVault, "PoolUpdated").withArgs(xvs.address, 0, 100, 1000);
    });
  });

  describe("setRewardAmountPerBlock", async () => {
    it("reverts if ACM does not allow the call", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(xvsVault.setRewardAmountPerBlock(xvs.address, 100)).to.be.revertedWith("Unauthorized");
      accessControl.isAllowedToCall.returns(true);
    });

    it("reverts if the token is not configured in XVSStore", async () => {
      await xvsStore.setRewardToken(xvs.address, false);
      await expect(xvsVault.setRewardAmountPerBlock(xvs.address, 100)).to.be.revertedWith("Invalid reward token");
    });

    it("emits RewardAmountPerBlockUpdated event", async () => {
      const tx = await xvsVault.setRewardAmountPerBlock(xvs.address, 111);
      await expect(tx).to.emit(xvsVault, "RewardAmountUpdated").withArgs(xvs.address, rewardPerBlock, 111);
    });

    it("updates reward amount per block", async () => {
      await xvsVault.setRewardAmountPerBlock(xvs.address, 111);
      expect(await xvsVault.rewardTokenAmountsPerBlock(xvs.address)).to.equal(111);
    });
  });

  describe("setWithdrawalLockingPeriod", async () => {
    it("reverts if ACM does not allow the call", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, 1)).to.be.revertedWith("Unauthorized");
      accessControl.isAllowedToCall.returns(true);
    });

    it("reverts if pool does not exist", async () => {
      await expect(xvsVault.setWithdrawalLockingPeriod(xvs.address, 1, 1)).to.be.revertedWith("vault: pool exists?");
    });

    it("reverts if the lock period is 0", async () => {
      await expect(xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, 0)).to.be.revertedWith(
        "Invalid new locking period",
      );
    });

    it("reverts if the lock period is absurdly high", async () => {
      const secondsInTwentyYears = 60 * 60 * 24 * 365 * 20;
      await expect(xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, secondsInTwentyYears)).to.be.revertedWith(
        "Invalid new locking period",
      );
    });

    it("emits WithdrawalLockingPeriodUpdated event", async () => {
      const tx = await xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, 1);
      await expect(tx).to.emit(xvsVault, "WithdrawalLockingPeriodUpdated").withArgs(xvs.address, poolId, lockPeriod, 1);
      await xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, lockPeriod);
    });

    it("updates lock period", async () => {
      let poolInfo = await xvsVault.poolInfos(xvs.address, poolId);
      expect(poolInfo.lockPeriod).to.equal(lockPeriod);

      await xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, 1);
      poolInfo = await xvsVault.poolInfos(xvs.address, poolId);

      expect(poolInfo.lockPeriod).to.equal(1);

      await xvsVault.setWithdrawalLockingPeriod(xvs.address, poolId, lockPeriod);
    });
  });

  describe("pendingReward", async () => {
    it("includes the old withdrawal requests in the rewards computation", async () => {
      const otherGuy = deployer;
      const depositAmount = parseUnits("100", 18);
      const requestedAmount = parseUnits("50", 18);

      await xvs.connect(user).approve(xvsVault.address, depositAmount);
      await xvs.connect(otherGuy).approve(xvsVault.address, depositAmount);

      await ethers.provider.send("evm_setAutomine", [false]);
      await xvsVault.connect(user).deposit(xvs.address, poolId, depositAmount);
      await xvsVault.connect(otherGuy).deposit(xvs.address, poolId, depositAmount);

      await mine();

      await xvsVault.connect(user).requestOldWithdrawal(xvs.address, poolId, requestedAmount);

      await mine(100);

      const expectedUserShare = parseUnits("50", 18); // Half of the rewards
      expect(await xvsVault.pendingReward(xvs.address, poolId, user.address)).to.equal(expectedUserShare);
      await ethers.provider.send("evm_setAutomine", [true]);
    });

    it("excludes the new withdrawal requests from the rewards computation", async () => {
      const otherGuy = deployer;
      const depositAmount = parseUnits("100", 18);
      const requestedAmount = parseUnits("50", 18);

      await xvs.connect(user).approve(xvsVault.address, depositAmount);
      await xvs.connect(otherGuy).approve(xvsVault.address, depositAmount);

      await ethers.provider.send("evm_setAutomine", [false]);
      await xvsVault.connect(user).deposit(xvs.address, poolId, depositAmount);
      await xvsVault.connect(otherGuy).deposit(xvs.address, poolId, depositAmount);

      await mine();

      await xvsVault.connect(user).requestWithdrawal(xvs.address, poolId, requestedAmount);

      await mine(100);

      const expectedUserShare = parseUnits("33", 18); // 1/3 of the rewards
      expect(await xvsVault.pendingReward(xvs.address, poolId, user.address)).to.equal(expectedUserShare);
      await ethers.provider.send("evm_setAutomine", [true]);
    });
  });

  describe("deposit", async () => {
    const depositAmount = parseUnits("100", 18);

    it("reverts if the vault is paused", async () => {
      await xvsVault.pause();
      await expect(xvsVault.deposit(xvs.address, poolId, depositAmount)).to.be.revertedWith("Vault is paused");
    });

    it("reverts if pool does not exist", async () => {
      await expect(xvsVault.deposit(xvs.address, 1, depositAmount)).to.be.revertedWith("vault: pool exists?");
    });

    it("transfers pool token to the vault", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      expect(await xvs.balanceOf(xvsVault.address)).to.eq(depositAmount);
    });

    it("updates user's balance", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);

      const userInfo = await xvsVault.getUserInfo(xvs.address, poolId, deployer.address);

      expect(userInfo.amount).to.eq(depositAmount);
      expect(userInfo.rewardDebt).to.eq(0);
    });

    it("fails if there's a pre-upgrade withdrawal request", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));

      await expect(xvsVault.deposit(xvs.address, poolId, parseUnits("50", 18))).to.be.revertedWith(
        "execute pending withdrawal",
      );
    });

    it("succeeds if the pre-upgrade withdrawal request has been executed", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));

      await mine(500);
      await xvsVault.executeWithdrawal(xvs.address, poolId);

      const previousUserInfo = await xvsVault.getUserInfo(xvs.address, poolId, deployer.address);

      await xvs.approve(xvsVault.address, depositAmount);
      await expect(xvsVault.deposit(xvs.address, poolId, depositAmount)).to.changeTokenBalance(
        xvs,
        xvsVault.address,
        depositAmount,
      );

      const currentUserInfo = await xvsVault.getUserInfo(xvs.address, poolId, deployer.address);

      expect(currentUserInfo.amount).to.equal(previousUserInfo.amount.add(depositAmount));
    });

    it("uses the safe _transferReward under the hood", async () => {
      const initialStoreBalance = parseUnits("500", 18);
      await xvs.connect(deployer).transfer(xvsStore.address, initialStoreBalance);
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);

      await mine(1000);

      const expectedReward = parseUnits("1001", 18);
      const expectedDebt = expectedReward.sub(parseUnits("500", 18)); // 501 XVS
      const tx = await xvsVault.deposit(xvs.address, poolId, 0);
      await expect(tx).to.changeTokenBalance(xvs, deployer.address, initialStoreBalance);
      await expect(tx).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, 0, expectedDebt);
    });
  });

  describe("executeWithdrawal", async () => {
    const depositAmount = parseUnits("100", 18);

    beforeEach(async () => {
      await xvs.connect(deployer).transfer(xvsStore.address, parseUnits("10000", 18));
    });

    it("fails if the vault is paused", async () => {
      await xvsVault.pause();
      await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.be.revertedWith("Vault is paused");
    });

    it("only transfers the requested amount for post-upgrade requests", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(1000);

      await xvsVault.connect(deployer).requestWithdrawal(xvs.address, poolId, parseUnits("10", 18));

      await mine(500);

      await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("10", 18),
      );
    });

    it("handles pre-upgrade withdrawal requests", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(1000);

      await expect(xvsVault.requestOldWithdrawal(xvs.address, poolId, depositAmount)).to.changeTokenBalance(
        xvs,
        deployer.address,
        0,
      );

      await mine(500);

      // Old-style withdrawals claim rewards when executed
      const expectedReward = parseUnits("1502", 18);
      await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        depositAmount.add(expectedReward),
      );
    });

    it("handles pre-upgrade and post-upgrade withdrawal requests", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(1000);

      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));
      await mine(500);

      // Old-style withdrawals claim rewards when executed
      const requestedAmount = parseUnits("50", 18);
      const expectedReward = parseUnits("1502", 18);
      await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        requestedAmount.add(expectedReward),
      );

      await mine(500);
      await xvsVault.requestWithdrawal(xvs.address, poolId, parseUnits("50", 18));
      await mine(500);

      // New-style withdrawals do not claim rewards when executed
      await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("50", 18),
      );
    });
  });

  describe("requestWithdrawal", async () => {
    const depositAmount = parseUnits("100", 18);

    it("fails if the vault is paused", async () => {
      await xvsVault.pause();
      await expect(xvsVault.requestWithdrawal(xvs.address, poolId, parseUnits("10", 18))).to.be.revertedWith(
        "Vault is paused",
      );
    });

    it("transfers rewards to the user", async () => {
      await xvs.connect(deployer).transfer(xvsStore.address, parseUnits("10000", 18));

      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);

      await expect(xvsVault.requestWithdrawal(xvs.address, poolId, depositAmount)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("1", 18),
      );
    });

    it("uses the safe _transferReward under the hood", async () => {
      const initialStoreBalance = parseUnits("500", 18);
      await xvs.connect(deployer).transfer(xvsStore.address, initialStoreBalance);
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);

      await mine(1000);

      const expectedReward = parseUnits("1001", 18);
      const expectedDebt = expectedReward.sub(parseUnits("500", 18)); // 501 XVS
      const tx = await xvsVault.requestWithdrawal(xvs.address, poolId, depositAmount);
      await expect(tx).to.changeTokenBalance(xvs, deployer.address, initialStoreBalance);
      await expect(tx).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, 0, expectedDebt);
    });

    it("fails if there's a pre-upgrade withdrawal request", async () => {
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("10", 18));

      await expect(xvsVault.requestWithdrawal(xvs.address, poolId, parseUnits("10", 18))).to.be.revertedWith(
        "execute pending withdrawal",
      );
    });
  });

  describe("claim", async () => {
    const depositAmount = parseUnits("100", 18);
    const initialStoreBalance = parseUnits("10000", 18);

    beforeEach(async () => {
      await xvs.connect(deployer).transfer(xvsStore.address, initialStoreBalance);
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(1000);
    });

    it("fails if there's a pre-upgrade withdrawal request", async () => {
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.be.revertedWith(
        "execute pending withdrawal",
      );
    });

    it("succeeds if the pre-upgrade withdrawal request has been executed", async () => {
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));
      await mine(500);
      await xvsVault.executeWithdrawal(xvs.address, poolId); // new reward starts accumulating
      await mine(43);

      const expectedReward = parseUnits("44", 18); // 43 + 1 blocks, 1 XVS each
      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        expectedReward,
      );
    });

    it("excludes pending withdrawals from the user's shares", async () => {
      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("1001", 18),
      );

      await mine(1000);

      // this should claim the pending rewards, so the next claim should be 0 XVS
      await xvsVault.connect(deployer).requestWithdrawal(xvs.address, poolId, depositAmount);
      await mine(500);

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("0", 18),
      );
    });

    it("correctly accounts for updates in reward per block", async () => {
      await xvsVault.setRewardAmountPerBlock(xvs.address, parseUnits("0.1", 18));
      const rewardForPreviousBlocks = parseUnits("1001", 18); // 1001 blocks, 1 XVS/block
      await mine(1000);
      const rewardForNewBlocks = parseUnits("100.1", 18); // 1001 blocks, 0.1 XVS/block

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        rewardForPreviousBlocks.add(rewardForNewBlocks),
      );
    });

    it("uses the safe _transferReward under the hood", async () => {
      await mine(9005); // 1000 in before hook + 9005 here + 1 block for claim = 10006 blocks total
      const expectedReward = parseUnits("10006", 18);
      const expectedDebt = expectedReward.sub(initialStoreBalance); // 6 XVS
      const tx = await xvsVault.claim(deployer.address, xvs.address, poolId);
      await expect(tx).to.changeTokenBalance(xvs, deployer.address, initialStoreBalance);
      await expect(tx).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, 0, expectedDebt);
    });
  });

  describe("_transferReward", async () => {
    const initialStoreBalance = parseUnits("333", 18);
    const initialDepositAmount = parseUnits("100", 18);

    beforeEach(async () => {
      await xvs.connect(deployer).transfer(xvsStore.address, initialStoreBalance);
      await xvs.approve(xvsVault.address, initialDepositAmount);
      await xvsVault.deposit(xvs.address, poolId, initialDepositAmount);
    });

    it("sends the available funds to the user", async () => {
      const reward = parseUnits("1001", 18);
      await expect(xvsVault.transferReward(xvs.address, deployer.address, reward)).to.changeTokenBalance(
        xvs,
        deployer.address,
        initialStoreBalance,
      );
    });

    it("emits VaultDebtUpdated event if vault debt is updated", async () => {
      const reward = parseUnits("1001", 18);
      const expectedDebt = reward.sub(initialStoreBalance);
      const tx = await xvsVault.transferReward(xvs.address, deployer.address, reward);
      await expect(tx).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, 0, expectedDebt);
    });

    it("does not emit VaultDebtUpdated event if vault debt is not updated", async () => {
      const tx = await xvsVault.transferReward(xvs.address, deployer.address, initialStoreBalance);
      await expect(tx).to.not.emit(xvsVault, "VaultDebtUpdated");
      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(0);
    });

    it("records the pending transfer", async () => {
      const reward = parseUnits("1001", 18);
      const expectedDebt = reward.sub(initialStoreBalance);
      await xvsVault.transferReward(xvs.address, deployer.address, reward);
      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(expectedDebt);
    });

    it("records several pending transfers", async () => {
      const reward1 = parseUnits("1001", 18);
      const tx1 = await xvsVault.transferReward(xvs.address, deployer.address, reward1);
      const expectedDebt1 = reward1.sub(initialStoreBalance);
      await expect(tx1).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, 0, expectedDebt1);
      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(expectedDebt1);

      const reward2 = parseUnits("5001", 18);
      const tx2 = await xvsVault.transferReward(xvs.address, deployer.address, reward2);
      const expectedDebt2 = expectedDebt1.add(reward2);
      await expect(tx2)
        .to.emit(xvsVault, "VaultDebtUpdated")
        .withArgs(xvs.address, deployer.address, expectedDebt1, expectedDebt2);
      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(expectedDebt2);
    });

    it("sends out the pending transfers in addition to reward if full amount <= funds available", async () => {
      const reward1 = parseUnits("1001", 18);
      await xvsVault.transferReward(xvs.address, deployer.address, reward1);
      const reward2 = parseUnits("5001", 18);
      await xvsVault.transferReward(xvs.address, deployer.address, reward2);

      const expectedDebt = reward1.add(reward2).sub(initialStoreBalance);
      const reward3 = parseUnits("222", 18);
      const debtWithReward = expectedDebt.add(reward3);

      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(expectedDebt);
      // Add money to the store
      await xvs.connect(deployer).transfer(xvsStore.address, debtWithReward);
      const tx = await xvsVault.transferReward(xvs.address, deployer.address, reward3);
      await expect(tx).to.changeTokenBalance(xvs, deployer.address, debtWithReward);
      await expect(tx).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, expectedDebt, 0);
      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(0);
    });

    it("sends a part of the pending transfers and reward if full amount > funds available", async () => {
      const reward1 = parseUnits("1001", 18);
      await xvsVault.transferReward(xvs.address, deployer.address, reward1);
      const reward2 = parseUnits("5001", 18);
      await xvsVault.transferReward(xvs.address, deployer.address, reward2);

      const oldDebt = reward1.add(reward2).sub(initialStoreBalance);
      const reward3 = parseUnits("222", 18);
      const newDebt = parseUnits("11", 18);

      // Add money to the store
      const transferredAmount = oldDebt.add(reward3).sub(newDebt);
      await xvs.connect(deployer).transfer(xvsStore.address, transferredAmount);

      const tx = await xvsVault.transferReward(xvs.address, deployer.address, reward3);
      await expect(tx).to.emit(xvsVault, "VaultDebtUpdated").withArgs(xvs.address, deployer.address, oldDebt, newDebt);
      await expect(tx).to.changeTokenBalance(xvs, deployer.address, transferredAmount);
      expect(await xvsVault.pendingRewardTransfers(xvs.address, deployer.address)).to.equal(newDebt);
    });
  });

  describe("pendingWithdrawalsBeforeUpgrade", () => {
    beforeEach(async () => {
      const depositAmount = parseUnits("100", 18);
      await xvs.connect(deployer).transfer(xvsStore.address, parseUnits("10000", 18));
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(1000);
    });

    it("returns zero if there were no pending withdrawals", async () => {
      const pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
      expect(pendingAmount).to.equal(0);
    });

    it("returns zero if there is only a new-style pending withdrawal", async () => {
      await xvsVault.requestWithdrawal(xvs.address, poolId, parseUnits("50", 18));

      const pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
      expect(pendingAmount).to.equal(0);
    });

    it("returns the requested amount if there is an old-style pending withdrawal", async () => {
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));

      const pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
      expect(pendingAmount).to.equal(parseUnits("50", 18));
    });

    it("returns the total requested amount if there are multiple old-style pending withdrawals", async () => {
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("49", 18));

      const pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
      expect(pendingAmount).to.equal(parseUnits("99", 18));
    });

    it("returns zero if the pending withdrawal was executed", async () => {
      await xvsVault.requestOldWithdrawal(xvs.address, poolId, parseUnits("50", 18));
      await mine(500);
      await xvsVault.executeWithdrawal(xvs.address, poolId);

      const pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
      expect(pendingAmount).to.equal(0);
    });
  });

  describe("Scenarios", async () => {
    const depositAmount = parseUnits("100", 18);

    it("works correctly with multiple claim, deposit, and withdrawal requests", async () => {
      await xvs.connect(deployer).transfer(xvsStore.address, parseUnits("10000", 18));
      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(1000);

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("1001", 18),
      );

      await mine(1000);

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("1001", 18),
      );

      await mine(400);

      await expect(
        xvsVault.connect(deployer).requestWithdrawal(xvs.address, poolId, depositAmount),
      ).to.changeTokenBalance(xvs, deployer.address, parseUnits("401", 18));

      await mine(500);

      await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        depositAmount,
      );

      await xvs.approve(xvsVault.address, depositAmount);
      await xvsVault.deposit(xvs.address, poolId, depositAmount);
      await mine(700);

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("701", 18),
      );

      await xvsVault.setRewardAmountPerBlock(xvs.address, 0);
      await mine(200);

      await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.changeTokenBalance(
        xvs,
        deployer.address,
        parseUnits("1", 18),
      );
    });
  });
});
