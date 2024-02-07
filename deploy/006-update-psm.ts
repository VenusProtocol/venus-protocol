import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";

  const { usdt: usdtAddress, vai: vaiAddress, normalVipTimelock: timelockAddress } = ADDRESSES[networkName];

  await catchUnknownSigner(
    deploy("PegStability_USDT", {
      contract: "PegStability",
      from: deployer,
      args: [usdtAddress, vaiAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner: timelockAddress,
        proxyContract: "OpenZeppelinTransparentProxy",
      },
    }),
  );
};

func.tags = ["PSM"];
export default func;
