import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { GovernorBravoDelegate } from "../typechain/contracts/Governance/";

//TESTNET DEPLOYED CONTRACTS
import {Contracts} from "../networks/testnet.json"

const GOVERNOR_PROXY_TESTNET = Contracts.GovernorBravoDelegator;
const NORMAL_VIP_TIMELOCK_ADDRESS = Contracts.Timelock;
const XVS_VAULT_TESTNET = Contracts.XVSVaultProxy;

console.log(Contracts.GovernorBravoDelegator);
console.log(Contracts.Timelock);
console.log(Contracts.XVSVaultProxy);

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

const TIMELOCK_MIN_DELAYS_TESTNET = {
  NORMAL: 600,
  FAST_TRACK: 300,
  CRITICAL: 100,
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;
  const governorProxy = await ethers.getContractAt("GovernorBravoDelegator", GOVERNOR_PROXY_TESTNET);

  const timeLockFastTrack = await deploy("Timelock_FastTrack", {
    contract: "Timelock",
    from: deployer,
    args: [GOVERNOR_PROXY_TESTNET, TIMELOCK_MIN_DELAYS_TESTNET.FAST_TRACK],
    log: true,
    autoMine: true,
  });

  const timeLockCritical = await deploy("Timelock_Critical", {
    contract: "Timelock",
    from: deployer,
    args: [GOVERNOR_PROXY_TESTNET, TIMELOCK_MIN_DELAYS_TESTNET.CRITICAL],
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
      GOVERNOR_PROXY_TESTNET,
    )) as GovernorBravoDelegate;
    tx = await governorProxy_Impl.initialize(
      XVS_VAULT_TESTNET,
      PROPOSAL_CONFIGS,
      [NORMAL_VIP_TIMELOCK_ADDRESS, timeLockFastTrack.address, timeLockCritical.address],
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
