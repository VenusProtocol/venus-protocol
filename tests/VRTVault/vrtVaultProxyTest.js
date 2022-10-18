const { address, bnbUnsigned, bnbMantissa, mergeInterface, freezeTime } = require("../Utils/BSC");

const vrtTotalSupply = bnbMantissa(30000000000);
const interestRatePerBlock = bnbUnsigned(28935185000);
const BigNum = require("bignumber.js");

const getAccrualStartBlockNumber = async (vrtVaultProxy, userAddress) => {
  const vrtVaultPositionRecord = await call(vrtVaultProxy, "userInfo", [userAddress]);
  return vrtVaultPositionRecord.accrualStartBlockNumber;
};

const getTotalPrincipalAmount = async (vrtVaultProxy, userAddress) => {
  const vrtVaultPositionRecord = await call(vrtVaultProxy, "userInfo", [userAddress]);
  return vrtVaultPositionRecord.totalPrincipalAmount;
};

const incrementBlocks = async (vrtVaultProxy, deltaBlocks) => {
  const blockNumberInVaultContract = await call(vrtVaultProxy, "getBlockNumber");
  const blockNumber = new BigNum(blockNumberInVaultContract).plus(new BigNum(deltaBlocks));
  await setBlockNumber(vrtVaultProxy, [blockNumber]);
};

const getBlockNumber = async vrtVaultProxy => {
  const blockNumber = await call(vrtVaultProxy, "getBlockNumber");
  return blockNumber;
};

const calculateAccruedInterest = (principalAmount, accrualStartBlockNumber, currentBlockNumber) => {
  return new BigNum(principalAmount)
    .multipliedBy(new BigNum(currentBlockNumber).minus(new BigNum(accrualStartBlockNumber)))
    .multipliedBy(interestRatePerBlock)
    .dividedToIntegerBy(1e18);
};

const setBlockNumber = async (vrtVaultProxy, blockNumber) => {
  await send(vrtVaultProxy, "setBlockNumber", [bnbUnsigned(blockNumber)]);
};

const depositVRT = async (vrt, vrtVaultProxy, userAddress, vrtDepositAmount) => {
  const vrtVaultProxyAddress = vrtVaultProxy._address;
  await send(vrt, "approve", [vrtVaultProxyAddress, vrtDepositAmount], { from: userAddress });
  const vrtBalanceOfVaultBeforeDeposit = await call(vrt, "balanceOf", [vrtVaultProxyAddress]);
  const vrtBalanceOfUserBeforeDeposit = await call(vrt, "balanceOf", [userAddress]);

  const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVaultProxy, userAddress);
  const currentBlockNumber = await getBlockNumber(vrtVaultProxy);
  const totalPrincipalAmount = await getTotalPrincipalAmount(vrtVaultProxy, userAddress);
  const accruedInterest = calculateAccruedInterest(totalPrincipalAmount, accrualStartBlockNumber, currentBlockNumber);

  const vrtDepositTransaction = await send(vrtVaultProxy, "deposit", [vrtDepositAmount], { from: userAddress });
  expect(vrtDepositTransaction).toSucceed();
  expect(vrtDepositTransaction).toHaveLog("Deposit", {
    user: userAddress,
    amount: vrtDepositAmount.toFixed(),
  });

  const expectedVrtBalanceOfVault = new BigNum(vrtBalanceOfVaultBeforeDeposit)
    .plus(vrtDepositAmount)
    .minus(accruedInterest);
  const vrtBalanceOfVaultAfterDeposit = await call(vrt, "balanceOf", [vrtVaultProxyAddress]);
  expect(new BigNum(vrtBalanceOfVaultAfterDeposit)).toEqual(expectedVrtBalanceOfVault);

  const expectedVrtBalanceOfUser = new BigNum(vrtBalanceOfUserBeforeDeposit)
    .minus(vrtDepositAmount)
    .plus(accruedInterest);
  const vrtBalanceOfUserAfterDeposit = await call(vrt, "balanceOf", [userAddress]);
  expect(new BigNum(vrtBalanceOfUserAfterDeposit)).toEqual(expectedVrtBalanceOfUser);

  return vrtDepositTransaction;
};

const assertAccruedInterest = async (vrtVaultProxy, userAddress, principalAmount) => {
  const accruedInterest = await call(vrtVaultProxy, "getAccruedInterest", [userAddress]);
  const currentBlockNumber = await getBlockNumber(vrtVaultProxy);
  const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVaultProxy, userAddress);
  const expectedAccruedInterest = await calculateAccruedInterest(
    principalAmount,
    accrualStartBlockNumber,
    currentBlockNumber,
  );
  expect(new BigNum(accruedInterest)).toEqual(new BigNum(expectedAccruedInterest));
  return accruedInterest;
};

const getBep20balance = async (token, address) => {
  return await call(token, "balanceOf", [address]);
};

describe("VRTVaultProxy", () => {
  let root, notAdmin, accounts, user1, user2, user3, treasury; // eslint-disable-line @typescript-eslint/no-unused-vars
  let vrtVaultProxy, vrtVaultProxyAdmin, vrtVaultProxyAddress;
  let vrtVault;
  let vrt, vrtAddress, vrtVaultAddress;
  let blockTimestamp;
  let preFundedVRTInVault = bnbUnsigned(10e18);

  beforeEach(async () => {
    [root, user1, user2, user3, treasury, ...accounts] = saddle.accounts;
    [root, notAdmin] = accounts;

    vrt = await deploy("VRT", [root], { from: root });
    vrtAddress = vrt._address;

    vrtVault = await deploy("VRTVaultHarness", [], { from: root });
    vrtVaultAddress = vrtVault._address;

    vrtVaultProxy = await deploy("VRTVaultProxy", [vrtVaultAddress, vrtAddress, interestRatePerBlock], { from: root });
    vrtVaultProxyAddress = vrtVaultProxy._address;
    vrtVaultProxyAdmin = await call(vrtVaultProxy, "admin");
    mergeInterface(vrtVaultProxy, vrtVault);

    await send(vrt, "transfer", [vrtVaultProxyAddress, preFundedVRTInVault], { from: root });
    blockTimestamp = bnbUnsigned(100);
    await freezeTime(blockTimestamp.toNumber());
  });

  describe("constructor", () => {
    it("sets admin to caller and addresses to 0", async () => {
      expect(await call(vrtVaultProxy, "admin")).toEqual(root);
      expect(await call(vrtVaultProxy, "pendingAdmin")).toBeAddressZero();
      expect(await call(vrtVaultProxy, "pendingImplementation")).toBeAddressZero();
      expect(await call(vrtVaultProxy, "implementation")).toEqual(vrtVaultAddress);

      const vrtAddressResp = await call(vrtVaultProxy, "vrt");
      expect(vrtAddressResp).toEqual(vrtAddress);
      const interestRatePerBlockResp = await call(vrtVaultProxy, "interestRatePerBlock");
      expect(new BigNum(interestRatePerBlockResp)).toEqual(new BigNum(interestRatePerBlock));
    });
  });

  describe("_setPendingImplementation", () => {
    describe("Check caller is admin", () => {
      it("does not change pending implementation address", async () => {
        await expect(
          send(vrtVaultProxy, "_setPendingImplementation", [vrtVault._address], { from: accounts[1] }),
        ).rejects.toRevert("revert Only admin can set Pending Implementation");
        expect(await call(vrtVaultProxy, "pendingImplementation")).toBeAddressZero();
      });
    });

    describe("succeeding", () => {
      it("stores pendingImplementation with value newPendingImplementation", async () => {
        const result = await send(vrtVaultProxy, "_setPendingImplementation", [vrtVault._address], { from: root });
        expect(await call(vrtVaultProxy, "pendingImplementation")).toEqual(vrtVault._address);
        expect(result).toHaveLog("NewPendingImplementation", {
          oldPendingImplementation: address(0),
          newPendingImplementation: vrtVaultAddress,
        });
      });
    });
  });

  describe("_acceptImplementation", () => {
    it("Check caller is pendingImplementation  and pendingImplementation ≠ address(0) ", async () => {
      expect(await send(vrtVaultProxy, "_setPendingImplementation", [vrtVault._address], { from: root }));
      await expect(send(vrtVaultProxy, "_acceptImplementation", { from: root })).rejects.toRevert(
        "revert only address marked as pendingImplementation can accept Implementation",
      );
      expect(await call(vrtVaultProxy, "implementation")).not.toEqual(vrtVaultProxy._address);
    });
  });

  describe("the vaultImpl must accept the responsibility of implementation", () => {
    let result;
    beforeEach(async () => {
      await send(vrtVaultProxy, "_setPendingImplementation", [vrtVault._address], { from: root });
      const pendingVRTVaultImpl = await call(vrtVaultProxy, "pendingImplementation");
      expect(pendingVRTVaultImpl).toEqual(vrtVault._address);
    });

    it("Store implementation with value pendingImplementation", async () => {
      vrtVaultProxyAdmin = await call(vrtVaultProxy, "admin");
      result = await send(vrtVault, "_become", [vrtVaultProxy._address], { from: vrtVaultProxyAdmin });
      expect(result).toSucceed();
      expect(await call(vrtVaultProxy, "implementation")).toEqual(vrtVault._address);
      expect(await call(vrtVaultProxy, "pendingImplementation")).toBeAddressZero();
    });
  });

  describe("Upgrade VRTVault", () => {
    it("should update the implementation and assert the existing-storage on upgraded implementation", async () => {
      vrtVault = await deploy("VRTVaultHarness", [], { from: root });
      vrtVaultAddress = vrtVault._address;
      await send(vrtVaultProxy, "_setPendingImplementation", [vrtVaultAddress], { from: root });
      await send(vrtVault, "_become", [vrtVaultProxy._address], { from: vrtVaultProxyAdmin });

      const vrtVaultImplementationFromProxy = await call(vrtVaultProxy, "implementation", []);
      expect(vrtVaultImplementationFromProxy).toEqual(vrtVaultAddress);

      const interestRatePerBlockFromVault = await call(vrtVaultProxy, "interestRatePerBlock", []);
      expect(interestRatePerBlockFromVault).toEqual(interestRatePerBlock.toString());

      const vrtFromVault = await call(vrtVaultProxy, "vrt", []);
      expect(vrtFromVault).toEqual(vrtAddress);
    });
  });

  describe("VRTVault Initialisation via VRTVaultProxy", () => {
    it("should assert VRT Balance of Root to TotalSupply", async () => {
      const vrtBalanceOfRoot = await call(vrt, "balanceOf", [root]);
      const expectedVRTBalanceOfRoot = new BigNum(vrtTotalSupply).minus(new BigNum(preFundedVRTInVault));
      expect(new BigNum(vrtBalanceOfRoot)).toEqual(new BigNum(expectedVRTBalanceOfRoot));
    });

    it("should initialize interestRatePerBlock in VRTVault", async () => {
      const interestRatePerBlockFromVault = await call(vrtVaultProxy, "interestRatePerBlock", []);
      expect(interestRatePerBlockFromVault).toEqual(interestRatePerBlock.toString());
    });

    it("should initialize vrt in VRTVault", async () => {
      const vrtFromVault = await call(vrtVaultProxy, "vrt", []);
      expect(vrtFromVault).toEqual(vrtAddress);
    });
  });

  describe("Deposit VRT", () => {
    it("should deposit VRT via VaultProxy", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVaultProxy, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);
      await send(vrt, "transfer", [user1, vrtDepositAmount], { from: root });
      await depositVRT(vrt, vrtVaultProxy, user1, vrtDepositAmount);
    });

    it("should accrue Interest on VRT Deposit with timeTravel of 1000 Blocks", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVaultProxy, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);
      await send(vrt, "transfer", [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVaultProxy, 1);
      await depositVRT(vrt, vrtVaultProxy, user1, vrtDepositAmount);
      const accruedInterestBeforeTimeAdvance = await assertAccruedInterest(vrtVaultProxy, user1, vrtDepositAmount);
      await incrementBlocks(vrtVaultProxy, 1000);
      const accruedInterestAfterTimeAdvance = await assertAccruedInterest(vrtVaultProxy, user1, vrtDepositAmount);
      expect(
        new BigNum(accruedInterestAfterTimeAdvance).isGreaterThan(new BigNum(accruedInterestBeforeTimeAdvance)),
      ).toEqual(true);
    });
  });

  describe("Claim VRT", () => {
    it("Claim AccruedInterest after VRT-Deposit", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVaultProxy, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, "transfer", [user1, vrtDepositAmount], { from: root });
      await incrementBlocks(vrtVaultProxy, 1);

      await depositVRT(vrt, vrtVaultProxy, user1, vrtDepositAmount);
      await assertAccruedInterest(vrtVaultProxy, user1, vrtDepositAmount);

      await incrementBlocks(vrtVaultProxy, 1000);

      const currentBlockNumber = await getBlockNumber(vrtVaultProxy);
      const accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVaultProxy, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(
        vrtDepositAmount,
        accrualStartBlockNumber,
        currentBlockNumber,
      );

      //claim
      const tokenBalanceBeforeClaim = await getBep20balance(vrt, user1);
      const tokenBalanceOfVaultBeforeClaim = await getBep20balance(vrt, vrtVaultProxyAddress);

      const vrtClaimTransaction = await send(vrtVaultProxy, "claim", [], { from: user1 });
      expect(vrtClaimTransaction).toSucceed();

      expect(vrtClaimTransaction).toHaveLog("Claim", {
        user: user1,
        interestAmount: expectedAccruedInterest,
      });

      const tokenBalanceAfterClaim = await getBep20balance(vrt, user1);
      expect(new BigNum(tokenBalanceAfterClaim).isGreaterThan(new BigNum(tokenBalanceBeforeClaim))).toEqual(true);
      expect(new BigNum(tokenBalanceAfterClaim)).toEqual(
        new BigNum(tokenBalanceBeforeClaim).plus(expectedAccruedInterest),
      );

      const tokenBalanceOfVaultAfterClaim = await getBep20balance(vrt, vrtVaultProxyAddress);
      expect(new BigNum(tokenBalanceOfVaultAfterClaim).isLessThan(new BigNum(tokenBalanceOfVaultBeforeClaim))).toEqual(
        true,
      );
      expect(new BigNum(tokenBalanceOfVaultAfterClaim)).toEqual(
        new BigNum(tokenBalanceOfVaultBeforeClaim).minus(expectedAccruedInterest),
      );
    });
  });

  describe("Withdraw VRT", () => {
    it("Withdraw after 1st VRT-Deposit", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVaultProxy, blockNumber);
      const vrtDepositAmount = bnbUnsigned(1e22);

      await send(vrt, "transfer", [user1, vrtDepositAmount], { from: root });

      await incrementBlocks(vrtVaultProxy, 1);

      await depositVRT(vrt, vrtVaultProxy, user1, vrtDepositAmount);
      await assertAccruedInterest(vrtVaultProxy, user1, vrtDepositAmount);

      let currentBlockNumber = await getBlockNumber(vrtVaultProxy);
      let accrualStartBlockNumber = await getAccrualStartBlockNumber(vrtVaultProxy, user1);
      const expectedAccruedInterest = await calculateAccruedInterest(
        vrtDepositAmount,
        accrualStartBlockNumber,
        currentBlockNumber,
      );
      const expectedPrincipalAmount = await getTotalPrincipalAmount(vrtVaultProxy, user1);
      const totalWithdrawnAmount = new BigNum(expectedAccruedInterest).plus(new BigNum(expectedPrincipalAmount));

      expect(new BigNum(totalWithdrawnAmount)).toEqual(new BigNum(expectedPrincipalAmount));
      expect(new BigNum(expectedAccruedInterest)).toEqual(new BigNum(0));

      const tokenBalanceBeforeWithdrawal = await getBep20balance(vrt, user1);
      const tokenBalanceOfVaultBeforeWithdrawal = await getBep20balance(vrt, vrtVaultProxyAddress);

      const vrtClaimTransaction = await send(vrtVaultProxy, "withdraw", [], { from: user1 });

      expect(vrtClaimTransaction).toHaveLog("Withdraw", {
        user: user1,
        withdrawnAmount: new BigNum(totalWithdrawnAmount).toFixed(),
        totalPrincipalAmount: new BigNum(expectedPrincipalAmount).toFixed(),
        accruedInterest: new BigNum(expectedAccruedInterest).toFixed(),
      });

      const tokenBalanceAfterWithdrawal = await getBep20balance(vrt, user1);
      expect(new BigNum(tokenBalanceAfterWithdrawal).isGreaterThan(new BigNum(tokenBalanceBeforeWithdrawal))).toEqual(
        true,
      );
      expect(new BigNum(tokenBalanceAfterWithdrawal)).toEqual(
        new BigNum(tokenBalanceBeforeWithdrawal).plus(new BigNum(totalWithdrawnAmount)),
      );

      const tokenBalanceOfVaultAfterWithdrawal = await getBep20balance(vrt, vrtVaultProxyAddress);
      expect(
        new BigNum(tokenBalanceOfVaultAfterWithdrawal).isLessThan(new BigNum(tokenBalanceOfVaultBeforeWithdrawal)),
      ).toEqual(true);
      expect(new BigNum(tokenBalanceOfVaultAfterWithdrawal)).toEqual(
        new BigNum(tokenBalanceOfVaultBeforeWithdrawal).minus(new BigNum(totalWithdrawnAmount)),
      );
    });
  });

  describe("Withdraw BEP20", () => {
    it("Admin can withdraw VRT", async () => {
      let blockNumber = 0;
      await setBlockNumber(vrtVaultProxy, blockNumber);

      const tokenBalanceBeforeWithdrawal = await getBep20balance(vrt, treasury);
      const tokenBalanceOfVaultBeforeWithdrawal = await getBep20balance(vrt, vrtVaultProxyAddress);

      const withdrawBep20Txn = await send(vrtVaultProxy, "withdrawBep20", [vrtAddress, treasury, preFundedVRTInVault], {
        from: root,
      });

      const tokenBalanceOfVaultAfterWithdrawal = await getBep20balance(vrt, vrtVaultProxyAddress);
      const tokenBalanceAfterWithdrawal = await getBep20balance(vrt, treasury);

      expect(withdrawBep20Txn).toSucceed();

      expect(withdrawBep20Txn).toHaveLog("WithdrawToken", {
        tokenAddress: vrtAddress,
        receiver: treasury,
        amount: new BigNum(preFundedVRTInVault).toFixed(),
      });

      expect(new BigNum(tokenBalanceAfterWithdrawal).isGreaterThan(new BigNum(tokenBalanceBeforeWithdrawal))).toEqual(
        true,
      );
      expect(new BigNum(tokenBalanceAfterWithdrawal)).toEqual(
        new BigNum(tokenBalanceBeforeWithdrawal).plus(preFundedVRTInVault),
      );

      expect(
        new BigNum(tokenBalanceOfVaultAfterWithdrawal).isLessThan(new BigNum(tokenBalanceOfVaultBeforeWithdrawal)),
      ).toEqual(true);
      expect(new BigNum(tokenBalanceOfVaultAfterWithdrawal)).toEqual(
        new BigNum(tokenBalanceOfVaultBeforeWithdrawal).minus(preFundedVRTInVault),
      );
    });
  });
});
