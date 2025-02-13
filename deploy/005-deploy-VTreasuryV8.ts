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
import zksyncmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/zksyncmainnet.json";
import zksyncsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/zksyncsepolia.json";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { skipSourceNetworks } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const getTimelock = async () => {
    switch (hre.network.name) {
      case "bsctestnet":
      case "bscmainnet": {
        const timelock = await deployments.get("NormalTimelock");
        return timelock.address;
      }
    }
    return "";
  };

  const acmAdminAccount: AdminAccounts = {
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
    unichainsepolia: "0x5e20F5A2e23463D39287185DF84607DF7068F314", // unichainsepoliaGovernanceDeployments.contracts.NormalTimelock.address
    unichainmainnet: "0xCb04dc78c99E20724023e5265fE177aa532E8164", // unichainmainnetGovernanceDeployments.contracts.NormalTimelock.address
    berachainbartio: "0x08Cf9d51df988F1E69174D22b7f93f97e1aAEbeE", // berachainbartioGovernanceDeployments.contracts.NormalTimelock.address
    bscmainnet: await getTimelock(),
    bsctestnet: await getTimelock(),
    hardhat: deployer,
  };

  const deployerSigner = await hre.ethers.getSigner(deployer);

  const treasuryInstance = await deploy("VTreasuryV8", {
    contract: "VTreasuryV8",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const adminAccount: string = acmAdminAccount[hre.network.name];

  const VTreasuryV8 = await ethers.getContractAt("VTreasuryV8", treasuryInstance.address);

  if ((await VTreasuryV8.owner()).toLowerCase() != adminAccount.toLowerCase()) {
    console.log("Transferring owner to venus admin account");
    const tx = await VTreasuryV8.connect(deployerSigner).transferOwnership(adminAccount);
    tx.wait();
    console.log("Ownership Transferred to: ", await VTreasuryV8.pendingOwner());
  }
};

func.tags = ["VTreasuryV8"];
func.skip = skipSourceNetworks();

export default func;
