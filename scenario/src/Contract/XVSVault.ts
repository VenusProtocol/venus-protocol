import { Contract } from 'ethers';
import { encodedNumber } from '../Encoding';
import { Callable, Sendable } from '../Invokation';

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

export interface XVSVaultMethods {
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  xvsVaultImplementation(): Callable<string>;
  _setPendingImplementation(newPendingImpl: string): Sendable<number>;
  _setPendingImplementation(): Sendable<number>;
  setXvsStore(xvs: string, xvsStore: XVSStore): Sendable<void>;
  add(rewardToken: string, allocPoint: encodedNumber, token: string, rewardPerBlock: encodedNumber, withUpdate: boolean): Sendable<void>;
  deposit(rewardToken: string, pid: number, amount: encodedNumber): Sendable<void>;
  requestWithdrawal(rewardToken: string, pid: number, amount: encodedNumber): Sendable<void>;
  executeWithdrawal(rewardToken: string, pid: number): Sendable<void>;
  checkpoints(account: string, index: number): Callable<Checkpoint>;
  numCheckpoints(account: string): Callable<number>;
  delegate(account: string): Sendable<void>;
  getCurrentVotes(account: string): Callable<number>;
  getPriorVotes(account: string, blockNumber: encodedNumber): Callable<number>;
}

export interface XVSVault extends Contract {
  methods: XVSVaultMethods;
  name: string;
}