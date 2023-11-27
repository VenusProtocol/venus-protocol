import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const addresses = ADDRESSES[networkName];
  const FEE_IN = 0;
  const FEE_OUT = 0;
  const VAI_MINT_CAP = parseUnits("5000000", 18); // 5M

  await deploy("PegStability_USDT", {
    contract: "PegStability",
    from: deployer,
    args: [addresses.usdt, addresses.vai],
    log: true,
    autoMine: true,
    proxy: {
      owner: addresses.normalVipTimelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [addresses.acm, addresses.treasury, addresses.oracle, FEE_IN, FEE_OUT, VAI_MINT_CAP],
      },
    },
  });

  const psm = await ethers.getContract("PegStability_USDT");

  if (network.name !== "hardhat") {
    const timelockAddress = addresses.normalVipTimelock;
    await psm.transferOwnership(timelockAddress);
    console.log(`PSM Contract (${psm.address}) owner changed from ${deployer} to ${timelockAddress}`);
  }
  return hre.network.live; // when live network, record the script as executed to prevent rexecution
};

func.id = "psm_initial_deploy"; // id required to prevent re-execution
func.tags = ["PSM"];

export default func;
