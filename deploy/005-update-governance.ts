import { parseUnits } from "ethers/lib/utils";
import { network } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Contracts as Mainnet } from "../networks/mainnet.json";
//TESTNET DEPLOYED CONTRACTS
import { Contracts as Testnet } from "../networks/testnet.json";
//MAINNET DEPLOYED CONTRACTS
import { GovernorBravoDelegate } from "../typechain/contracts/Governance/";

const networkName: string = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";

interface Address {
  [key: string]: string;
}

interface Delay {
  [key: string]: number;
}

interface AddressConfig {
  [key: string]: Address;
}

interface DelayConfig {
  [key: string]: Delay;
}

const addresses: AddressConfig = {
  bsctestnet: {
    governorProxy: Testnet.GovernorBravoDelegator,
    normalVipTimelock: Testnet.Timelock,
    xvsVault: Testnet.XVSVaultProxy,
  },
  bscmainnet: {
    governorProxy: "0x2d56dC077072B53571b8252008C60e945108c75a",
    normalVipTimelock: Mainnet.Timelock,
    xvsVault: Mainnet.XVSVaultProxy,
  },
};

const PROPOSAL_CONFIGS = [
  // ProposalType.NORMAL
  {
    votingDelay: 150,
    votingPeriod: 150,
    proposalThreshold: parseUnits("150000", 18),
  },
  // ProposalType.FASTTRACK
  {
    votingDelay: 100,
    votingPeriod: 100,
    proposalThreshold: parseUnits("200000", 18),
  },
  // ProposalType.CRITICAL
  {
    votingDelay: 50,
    votingPeriod: 50,
    proposalThreshold: parseUnits("250000", 18),
  },
];

const timelockDelays: DelayConfig = {
  bsctestnet: {
    NORMAL: 600,
    FAST_TRACK: 300,
    CRITICAL: 100,
  },
  bscmainnet: {
    NORMAL: 172800,
    FAST_TRACK: 21600,
    CRITICAL: 3600,
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;
  const governorProxy = await ethers.getContractAt("GovernorBravoDelegator", addresses[networkName].governorProxy);

  const timeLockFastTrack = await deploy("Timelock_FastTrack", {
    contract: "Timelock",
    from: deployer,
    args: [addresses[networkName].governorProxy, timelockDelays[networkName].FAST_TRACK],
    log: true,
    autoMine: true,
  });

  const timeLockCritical = await deploy("Timelock_Critical", {
    contract: "Timelock",
    from: deployer,
    args: [addresses[networkName].governorProxy, timelockDelays[networkName].CRITICAL],
    log: true,
    autoMine: true,
  });

  const newImplementation = await deploy("GovernorBravoV4", {
    contract: "GovernorBravoDelegate",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
  if (newImplementation.address) {
    let tx;
    if (newImplementation.newlyDeployed) {
      tx = await governorProxy._setImplementation(newImplementation.address);
      await tx.wait();
      console.log("New implementation successfully set to: " + newImplementation.address);
    }
    const governorProxy_Impl = (await ethers.getContractAt(
      "GovernorBravoDelegate",
      addresses[networkName].governorProxy,
    )) as GovernorBravoDelegate;
    tx = await governorProxy_Impl.initialize(
      addresses[networkName].xvsVault,
      PROPOSAL_CONFIGS,
      [addresses[networkName].normalVipTimelock, timeLockFastTrack.address, timeLockCritical.address],
      deployer,
    );
    await tx.wait();
    console.log("Sucessfully initialized new governance via proxy: " + governorProxy.address);
  } else {
    console.log("Could not get implementation address");
  }
};

func.tags = ["UpdateGovernanceV4"];

export default func;
