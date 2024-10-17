import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  if (!network.live) {
    await deploy("InterestRateModelVUSDC", {
      contract: "JumpRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [0, "50000000000000000", "1090000000000000000", "800000000000000000"],
    });

    await deploy("InterestRateModelVETH", {
      contract: "JumpRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [0, "40000000000000000", "1080000000000000000", "700000000000000000"],
    });
  }

  if (network.name === "bscmainnet" || network.name === "bsctestnet") {
    await deploy("InterestRateModelVBNB", {
      contract: "TwoKinksInterestRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [
        0,
        parseUnits("0.225", 18),
        parseUnits("0.4", 18),
        parseUnits("0.35", 18),
        parseUnits("0.21", 18),
        parseUnits("0.7", 18),
        parseUnits("5", 18),
      ],
    });
  }
};

func.tags = ["InterestRateModel"];
func.skip = async hre =>
  hre.network.name !== "hardhat" && hre.network.name !== "bscmainnet" && hre.network.name !== "bsctestnet";

export default func;
