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
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network } = hre;

  const adminAccount: AdminAccounts = {
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
    bscmainnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    bsctestnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
  };

  const prime = await ethers.getContract("Prime");
  const plp = await ethers.getContract("PrimeLiquidityProvider");

  if (network.name !== "hardhat") {
    console.log("Transferring Prime ownership to Timelock");
    await prime.transferOwnership(adminAccount[network.name]);

    console.log("Transferring PLP ownership to Timelock");
    await plp.transferOwnership(adminAccount[network.name]);
  }
};

func.tags = ["Prime"];
func.id = "configure_prime"; // id required to prevent re-execution

export default func;
