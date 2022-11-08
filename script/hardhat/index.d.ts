/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars */
import { Contract } from "@ethersproject/contracts";

// Governance
export function deployGovernorBravoDelegate(): Contract {}
export function deployGovernorBravoDelegator(config: {
  timelockAddress: string;
  xvsVaultAddress: string;
  guardianAddress: string;
  governorBravoDelegateAddress: string;
}): Contract {}
export function verifyGovernorBravoDelegate() {}
export function verifyGovernorBravoDelegator() {}
export function deployGovernorAlpha(config: {
  timelockAddress: string;
  xvsVaultAddress: string;
  guardianAddress: string;
}): Contract {}
export function deployGovernorAlpha2(config: {
  timelockAddress: string;
  xvsVaultAddress: string;
  guardianAddress: string;
  lastProposalId: number;
}): Contract {}

// Vault
export function deployVrtVaultProxy(): Contract {}
export function deployVrtVault(): Contract {}
export function deployXvsStore(): Contract {}
export function deployXvsVaultProxy(): Contract {}
export function deployXvsVault(): Contract {}
export function queryVrtVaultViaVaultProxy() {}
export function verifyVrtVaultProxy() {}
export function verifyVrtVault() {}
export function verifyXvsStore() {}
export function verifyXvsVaultProxy() {}
export function verifyXvsVault() {}
export function vrtVaultAcceptAsImplForProxy() {}
export function vrtVaultSetImplForVaultProxy() {}

// Comptroller
export function deployNextComptrollerPrologue(): {
  vaiControllerContract: Contract;
  comptrollerLensContract: Contract;
  comptrollerContract: Contract;
  liquidatorContract: Contract;
} {}

// Lens
export function deploySnapshotLens(): Contract {}
export function deployVenusLens(): Contract {}
export function getDailyXvs() {}
export function getVtokenBalance() {}
export function verifySnapshotLens() {}
export function verifyVenusLens() {}

// VRT Conversion
export function deployVrtConverterPro(): Contract {}
export function deployVrtConverter(): Contract {}
export function queryVrtConverter() {}
export function setXvsVesting() {}
export function verifyVrtConverterPro() {}
export function verifyVrtConverter() {}

// XVS Vesting
export function deployXvsVestingProxy(): Contract {}
export function deployXvsVesting(): Contract {}
export function setVrtConverter() {}
export function verifyXvsVestingProxy() {}
export function verifyXvsVesting() {}
