import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function ({ getNamedAccounts, deployments, network }: HardhatRuntimeEnvironment) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";

  const stakingPeriod = networkName === "bscmainnet" ? 90 * 24 * 60 * 60 : 60 * 10;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const minimumXVS = ethers.utils.parseEther("1000");
  const blocksPeryear = 10512000; // 3 secs per block
  const isTimeBased = false; // for L2s revise this value

  await catchUnknownSigner(
    deploy("PrimeLiquidityProvider", {
      from: deployer,
      log: true,
      deterministicDeployment: false,
      args: [isTimeBased, blocksPeryear],
      proxy: {
        owner: ADDRESSES[networkName].normalVipTimelock,
        proxyContract: "OpenZeppelinTransparentProxy",
      },
    }),
  );

  await deploy("VAIController_Implementation", {
    contract: "VAIController",
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [],
  });

  await catchUnknownSigner(
    deploy("Prime", {
      from: deployer,
      log: true,
      deterministicDeployment: false,
      args: [
        ADDRESSES[networkName].wbnb,
        ADDRESSES[networkName].vbnb,
        blocksPeryear,
        stakingPeriod,
        minimumXVS,
        maximumXVSCap,
        isTimeBased,
      ],
      proxy: {
        owner: ADDRESSES[networkName].normalVipTimelock,
        proxyContract: "OpenZeppelinTransparentProxy",
      },
    }),
  );
};

export default func;
func.tags = ["PrimeVaiUpgrade"];