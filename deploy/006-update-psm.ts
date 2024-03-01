import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const usdtAddress = (await deployments.get("USDT")).address;
  const vaiAddress = (await deployments.get("VAI")).address;
  const normalVipTimelockAddress = (await deployments.get("NormalTimelock")).address;

  await catchUnknownSigner(
    deploy("PegStability_USDT", {
      contract: "PegStability",
      from: deployer,
      args: [usdtAddress, vaiAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner: network.name === "hardhat" ? deployer : normalVipTimelockAddress,
        proxyContract: "OpenZeppelinTransparentProxy",
      },
    }),
  );
};

func.tags = ["PSM"];
export default func;
