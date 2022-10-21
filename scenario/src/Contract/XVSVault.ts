import { Contract } from "../Contract";
import { encodedNumber } from "../Encoding";
import { Callable, Sendable } from "../Invokation";

interface Checkpoint {
  fromBlock: number;
  votes: number;
}

export interface XVSStoreMethods {
  admin(): Callable<string>;
  setRewardToken(tokenAddress: string, status: boolean): Sendable<void>;
}

export interface XVSStore extends Contract {
  methods: XVSStoreMethods;
  name: string;
}

export interface XVSVaultProxyMethods {
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  xvsVaultImplementation(): Callable<string>;
  pendingXVSVaultImplementation(): Callable<string>;
  _setPendingImplementation(newPendingImplementation: string): Sendable<number>;
  _acceptImplementation(): Sendable<number>;
  _setPendingAdmin(newPendingAdmin: string): Sendable<number>;
  _acceptAdmin(): Sendable<number>;
}

export interface XVSVaultProxy extends Contract {
  methods: XVSVaultProxyMethods;
  name: string;
}

export interface XVSVaultImplMethods {
  _become(xvsVaultProxy: string): Sendable<void>;
  setXvsStore(xvs: string, xvsStore: string): Sendable<void>;
  add(
    rewardToken: string,
    allocPoint: encodedNumber,
    token: string,
    rewardPerBlock: encodedNumber,
    lockPeriod: encodedNumber,
  ): Sendable<void>;
  deposit(rewardToken: string, pid: number, amount: encodedNumber): Sendable<void>;
  requestWithdrawal(rewardToken: string, pid: number, amount: encodedNumber): Sendable<void>;
  executeWithdrawal(rewardToken: string, pid: number): Sendable<void>;
  setWithdrawalLockingPeriod(rewardToken: string, pid: number, newPeriod: number): Sendable<void>;
  checkpoints(account: string, index: number): Callable<Checkpoint>;
  numCheckpoints(account: string): Callable<number>;
  delegate(account: string): Sendable<void>;
  getCurrentVotes(account: string): Callable<number>;
  getPriorVotes(account: string, blockNumber: encodedNumber): Callable<number>;
}

export interface XVSVaultImpl extends Contract {
  methods: XVSVaultImplMethods;
  name: string;
}

export interface XVSVaultMethods extends XVSVaultProxyMethods, XVSVaultImplMethods {}

export interface XVSVault extends Contract {
  methods: XVSVaultMethods;
  name: string;
}

interface XVSVaultHarnessMethods extends XVSVaultMethods {
  getPriorVotesHarness(account: string, blockNumber: encodedNumber, votePower: encodedNumber): Callable<number>;
}

export interface XVSVaultHarness extends Contract {
  methods: XVSVaultHarnessMethods;
  name: string;
}
