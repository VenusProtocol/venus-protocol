import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, BigNumberish, Wallet } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { IERC20Upgradeable, XVS, XVSStore, XVSVaultScenario, XVSVaultScenario__factory } from "../../../typechain";
import { IAccessControlManager } from "../../../typechain/contracts/Governance";

const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
const rewardPerBlock = bigNumber18.mul(1);
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
    await xvs.connect(deployer).transfer(xvsStore.address, bigNumber18.mul(10000));
    await xvs.connect(deployer).transfer(user.address, bigNumber18.mul(1000));

    await xvsStore.setRewardToken(xvs.address, true);

    await xvsVault.add(xvs.address, allocPoint, xvs.address, rewardPerBlock, lockPeriod);
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
      xvsVault.setVariable("xvsStore", ethers.constants.AddressZero);
      await expect(xvsVault.add(...poolParams)).to.be.revertedWith("Store contract addres is empty");
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

  it("check xvs balance", async () => {
    expect(await xvs.balanceOf(xvsStore.address)).to.eq(bigNumber18.mul(10000));
  });

  it("check if pool exists", async () => {
    const pool = await xvsVault.poolInfos(xvs.address, 0);
    expect(pool.token).to.eq(xvs.address);
    expect(pool.allocPoint).to.eq(allocPoint);
    expect(pool.accRewardPerShare).to.eq(0);
    expect(pool.lockPeriod).to.eq(lockPeriod);
  });

  it("earn reward for staking", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);

    // Revert when vault is paused
    await xvsVault.pause();
    await expect(xvsVault.deposit(xvs.address, poolId, depositAmount)).to.revertedWith("Vault is paused");
    await xvsVault.resume();

    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    expect(await xvs.balanceOf(xvsVault.address)).to.eq(depositAmount);

    const userInfo = await xvsVault.getUserInfo(xvs.address, poolId, deployer.address);

    expect(userInfo.amount).to.eq(depositAmount);
    expect(userInfo.rewardDebt).to.eq(0);

    await mine(1000);

    let previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.connect(deployer).requestWithdrawal(xvs.address, poolId, depositAmount);
    let currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(bigNumber18.mul(1001).toString());

    await mine(500);

    previousXVSBalance = await xvs.balanceOf(deployer.address);

    // Revert when vault is paused
    await xvsVault.pause();
    await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.revertedWith("Vault is paused");
    await xvsVault.resume();

    await xvsVault.executeWithdrawal(xvs.address, poolId);
    currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(depositAmount.toString());
  });

  it("claim reward", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    await mine(1000);

    let previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.claim(deployer.address, xvs.address, poolId);
    let currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(bigNumber18.mul(1001).toString());

    await mine(1000);

    previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.claim(deployer.address, xvs.address, poolId);
    currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(bigNumber18.mul(1001).toString());

    await mine(1000);

    previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.connect(deployer).requestWithdrawal(xvs.address, poolId, depositAmount);
    currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(bigNumber18.mul(1001).toString());

    await mine(500);

    previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.executeWithdrawal(xvs.address, poolId);
    currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(depositAmount.toString());

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    await mine(1000);

    previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.claim(deployer.address, xvs.address, poolId);
    currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(bigNumber18.mul(1001).toString());

    await xvsVault.setRewardAmountPerBlock(xvs.address, 0);
    await mine(1000);

    previousXVSBalance = await xvs.balanceOf(deployer.address);
    await xvsVault.claim(deployer.address, xvs.address, poolId);
    currentXVSBalance = await xvs.balanceOf(deployer.address);
    expect(currentXVSBalance.sub(previousXVSBalance).toString()).to.be.equal(bigNumber18.mul(1).toString());
  });

  it("no reward for pending withdrawals", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    const previousXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    await xvsVault.requestWithdrawal(xvs.address, poolId, depositAmount);

    const currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    expect(Number(previousXVSBalance) + 1).to.be.equal(Number(currentXVSBalance));
  });

  it("handle pre-upgrade withdrawal requests", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    let previousXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    await mine(1000);
    await xvsVault.requestOldWithdrawal(xvs.address, poolId, depositAmount);

    let currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    expect(Number(previousXVSBalance)).to.be.equal(Number(currentXVSBalance));

    previousXVSBalance = currentXVSBalance;

    await mine(500);

    // Revert when vault is paused
    await xvsVault.pause();
    await expect(xvsVault.executeWithdrawal(xvs.address, poolId)).to.revertedWith("Vault is paused");
    await xvsVault.resume();

    await xvsVault.executeWithdrawal(xvs.address, poolId);

    currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());
    expect(Number(previousXVSBalance)).to.be.lt(Number(currentXVSBalance));
  });

  it("handle pre-upgrade and post-upgrade withdrawal requests", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    let previousXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    await mine(1000);
    await xvsVault.requestOldWithdrawal(xvs.address, poolId, bigNumber18.mul(50));

    // Revert when vault is paused
    await xvsVault.pause();
    await expect(xvsVault.requestWithdrawal(xvs.address, poolId, bigNumber18.mul(50))).to.revertedWith(
      "Vault is paused",
    );
    await xvsVault.resume();

    await expect(xvsVault.requestWithdrawal(xvs.address, poolId, bigNumber18.mul(50))).to.be.revertedWith(
      "execute pending withdrawal",
    );

    await mine(500);
    await xvsVault.executeWithdrawal(xvs.address, poolId);
    let currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    expect(Number(previousXVSBalance)).to.be.lt(Number(currentXVSBalance));

    previousXVSBalance = currentXVSBalance;

    await mine(500);
    xvsVault.requestWithdrawal(xvs.address, poolId, bigNumber18.mul(50));

    currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    await mine(500);
    await xvsVault.executeWithdrawal(xvs.address, poolId);

    currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());
    expect(Number(previousXVSBalance)).to.be.lt(Number(currentXVSBalance));
  });

  it("handle pre-upgrade withdrawal and post-upgrade deposit/claim requests", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    let previousXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    await mine(1000);
    await xvsVault.requestOldWithdrawal(xvs.address, poolId, bigNumber18.mul(50));

    await expect(xvsVault.deposit(xvs.address, poolId, bigNumber18.mul(50))).to.be.revertedWith(
      "execute pending withdrawal",
    );

    await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.be.revertedWith(
      "execute pending withdrawal",
    );

    await mine(500);
    await xvsVault.executeWithdrawal(xvs.address, poolId);
    let currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    expect(Number(previousXVSBalance)).to.be.lt(Number(currentXVSBalance));

    previousXVSBalance = currentXVSBalance;

    await mine(500);

    const previousUserInfo = await xvsVault.getUserInfo(xvs.address, poolId, deployer.address);

    await xvs.approve(xvsVault.address, depositAmount);
    await expect(xvsVault.deposit(xvs.address, poolId, depositAmount)).to.be.not.reverted;

    const currentUserInfo = await xvsVault.getUserInfo(xvs.address, poolId, deployer.address);

    expect(Number(currentUserInfo.amount)).to.be.equal(Number(previousUserInfo.amount.add(depositAmount)));

    previousXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());
    await expect(xvsVault.claim(deployer.address, xvs.address, poolId)).to.be.not.reverted;
    currentXVSBalance = ethers.utils.formatEther((await xvs.balanceOf(deployer.address)).toString());

    expect(Number(previousXVSBalance)).to.be.lt(Number(currentXVSBalance));
  });

  it("disable deposit/claim/withdrawal on frontend", async () => {
    const depositAmount = bigNumber18.mul(100);

    await xvs.approve(xvsVault.address, depositAmount);
    await xvsVault.deposit(xvs.address, poolId, depositAmount);

    await mine(1000);
    await xvsVault.requestOldWithdrawal(xvs.address, poolId, bigNumber18.mul(50));

    let pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
    expect(pendingAmount).to.be.gt(0);

    await mine(500);
    await xvsVault.executeWithdrawal(xvs.address, poolId);

    pendingAmount = await xvsVault.pendingWithdrawalsBeforeUpgrade(xvs.address, poolId, deployer.address);
    expect(pendingAmount).to.be.equal(0);
  });
});
