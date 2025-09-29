import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { markets } from "../helpers/markets";
import { getRateModelName } from "../helpers/rateModelHelpers";
import { writeGeneratedContract } from "../helpers/writeFile";

const checkpoints = {
  bsctestnet: {
    at: 1748243100, // 2025-05-26 07:05:00 AM UTC,
    fromBlocksPerYear: 21_024_000,
    toBlocksPerYear: 42_048_000,
  },
  bscmainnet: {
    at: 1751250600, // 2025-06-30 02:30:00 AM UTC
    fromBlocksPerYear: 21_024_000,
    toBlocksPerYear: 42_048_000,
  },
};

const capitalize = (s: string) => `${s.charAt(0).toUpperCase()}${s.substring(1)}`;

const getSetterContractName = (networkName: string) => `SetCheckpoint${capitalize(networkName)}`;

const generateSetterContract = (networkName: string, admin: string, setterCode: string[]) => {
  const body = setterCode.map(line => `        ${line}`).join("\n");
  return `
// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

interface VBNBAdminInterface {
    function setInterestRateModel(address) external;
}

interface VTokenInterface {
    function _setInterestRateModel(address) external;
}

contract ${getSetterContractName(networkName)} {
    error Unauthorized();

    function run() external {
        if (msg.sender != ${admin}) {
            revert Unauthorized();
        }
${body}
    }
}`;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chain = hre.getNetworkName() as keyof typeof checkpoints; // ok since we skip the others
  const timelock = await deployments.get("NormalTimelock");
  const { at, fromBlocksPerYear, toBlocksPerYear } = checkpoints[chain];
  const marketsConfig = markets[chain];

  const setterCode: string[] = [];
  for (const market of marketsConfig) {
    const { symbol, interestRateModel } = market;
    console.log(`Deploying checkpoint view for ${symbol}`);
    const oldRateModelName = getRateModelName(interestRateModel, fromBlocksPerYear);
    const newRateModelName = getRateModelName(interestRateModel, toBlocksPerYear);
    console.log("  from", oldRateModelName);
    console.log("    to", newRateModelName);
    const oldRateModel = await deployments.get(oldRateModelName);
    const newRateModel = await deployments.get(newRateModelName);
    const checkpointViewName = `CheckpointView_From_${oldRateModelName}_To_bpy${toBlocksPerYear}_At_${at}`;
    const checkpointView = await deploy(checkpointViewName, {
      contract: "CheckpointView",
      from: deployer,
      args: [oldRateModel.address, newRateModel.address, at],
      log: true,
      skipIfAlreadyDeployed: true,
      waitConfirmations: 3,
    });
    const vToken = await deployments.get(`${symbol}`);
    setterCode.push("");
    setterCode.push(`// ${symbol} -> ${checkpointViewName}`);
    if (symbol === "vBNB") {
      const vBNBAdmin = await deployments.get("VBNBAdmin");
      setterCode.push(`VBNBAdminInterface(${vBNBAdmin.address}).setInterestRateModel(${checkpointView.address});`);
    } else {
      setterCode.push(`VTokenInterface(${vToken.address})._setInterestRateModel(${checkpointView.address});`);
    }
    console.log(`-----------------------------------------`);
  }
  const setterContractCode = generateSetterContract(chain, timelock.address, setterCode);
  writeGeneratedContract(`${getSetterContractName(chain)}.sol`, setterContractCode);
};

func.tags = ["RateModelCheckpoint"];
func.skip = async hre => !Object.keys(checkpoints).includes(hre.network.name);

export default func;
