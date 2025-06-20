import arbitrumoneGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/arbitrumone.json";
import arbitrumsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/arbitrumsepolia.json";
import basemainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/basemainnet.json";
import basesepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/basesepolia.json";
import ethereumGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/ethereum.json";
import opbnbmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opbnbmainnet.json";
import opbnbtestnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opbnbtestnet.json";
import opmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opmainnet.json";
import opsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opsepolia.json";
import sepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/sepolia.json";
import unichainmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/unichainmainnet.json";
import unichainsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/unichainsepolia.json";
import zksyncmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/zksyncmainnet.json";
import zksyncsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/zksyncsepolia.json";
import { ethers, network } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

interface Config {
  [key: string]: number;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const isTimeBased = false; // configure this value if time based deployment

  const blocksPerYear: Config = {
    bsctestnet: 21_024_000, // 1.5 sec per block
    sepolia: 2_628_000, // 12 sec per block
    arbitrumsepolia: 0, // time based deployment
    opsepolia: 0, // time based deployment
    opmainnet: 0, // time based deployment
    arbitrumone: 0, // time based deployment
    zksyncsepolia: 0, // time based deployment
    zksyncmainnet: 0, // time based deployment
    unichainsepolia: 0, // time based deployment
    bscmainnet: 21_024_000,
    ethereum: 2_628_000,
    basesepolia: 0, // time based deployment
    basemainnet: 0, // time based deployment
    unichainmainnet: 0, // time based deployment
    berachainbepolia: 0, // time based deployment
    hardhat: 100,
  };

  const adminAccount: AdminAccounts = {
    bscmainnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    bsctestnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    sepolia: sepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    ethereum: ethereumGovernanceDeployments.contracts.NormalTimelock.address,
    opbnbtestnet: opbnbtestnetGovernanceDeployments.contracts.NormalTimelock.address,
    opbnbmainnet: opbnbmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    arbitrumsepolia: arbitrumsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    arbitrumone: arbitrumoneGovernanceDeployments.contracts.NormalTimelock.address,
    zksyncsepolia: zksyncsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    zksyncmainnet: zksyncmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    opsepolia: opsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    opmainnet: opmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    basesepolia: basesepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    basemainnet: basemainnetGovernanceDeployments.contracts.NormalTimelock.address,
    unichainsepolia: unichainsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    unichainmainnet: unichainmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    berachainbepolia: "0xAb3DBA18664B96AD54459D06Ca8BD18C9146d5CE", // berachainbepoliaGovernanceDeployments.contracts.NormalTimelock.address
    hardhat: deployer,
  };

  const accessControlManager = await ethers.getContract("AccessControlManager");

  const xvs = await ethers.getContract("XVS");
  const xvsVaultProxyDeployment = await ethers.getContract("XVSVaultProxy");
  const xvsStoreDeployment = await ethers.getContract("XVSStore");

  let xvsVault = await ethers.getContract("XVSVaultProxy_Implementation");
  await xvsVaultProxyDeployment._setPendingImplementation(xvsVault.address);
  await xvsVault._become(xvsVaultProxyDeployment.address);

  xvsVault = await ethers.getContractAt("XVSVault", xvsVaultProxyDeployment.address);

  let txn = await xvsVault.initializeTimeManager(isTimeBased, blocksPerYear[network.name]);
  await txn.wait();

  txn = await xvsVault.setXvsStore(xvs.address, xvsStoreDeployment.address);
  await txn.wait();

  txn = await xvsVault.setAccessControl(accessControlManager.address);
  await txn.wait();

  await xvsStoreDeployment.setNewOwner(xvsVaultProxyDeployment.address);

  if (!hre.network.live) {
    const tx = await accessControlManager.giveCallPermission(
      ethers.constants.AddressZero,
      "add(address,uint256,address,uint256,uint256)",
      deployer,
    );
    await tx.wait();

    // Add token pool to xvs vault
    const allocPoint = 100;
    const token = xvs.address;
    const rewardToken = xvs.address;
    const rewardPerBlock = "61805555555555555";
    const lockPeriod = 604800;

    await xvsVault.add(rewardToken, allocPoint, token, rewardPerBlock, lockPeriod);
  } else {
    const owner = adminAccount[hre.network.name];
    console.log("Please accept ownership of vault and store");
    txn = await xvsVaultProxyDeployment._setPendingAdmin(owner);
    await txn.wait();

    txn = await xvsStoreDeployment.setPendingAdmin(owner);
    await txn.wait();
  }
};

func.tags = ["xvs-vault"];
func.id = "xvs_vault_configuration"; // id required to prevent re-execution

export default func;
