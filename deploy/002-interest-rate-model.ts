import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const mantissaToBps = (num: BigNumberish) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

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

  if (network.name === "bscmainnet") {
    await deploy("InterestRateModelVETH", {
      contract: "JumpRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [0, parseUnits("0.03", 18), parseUnits("4.5", 18), parseUnits("0.9", 18)],
    });

    const baseRatePerYear = parseUnits("0", 18);
    const multiplierPerYear = parseUnits("0.175", 18);
    const jumpMultiplierPerYear = parseUnits("2.5", 18);
    const kink = parseUnits("0.8", 18);
    const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink].map(mantissaToBps);
    const rateModelName = `JumpRateModel_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps`;

    await deploy(rateModelName, {
      contract: "JumpRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink],
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
        parseUnits("0.125", 18),
        parseUnits("0.4", 18),
        parseUnits("0.9", 18),
        parseUnits("0.21", 18),
        parseUnits("0.8", 18),
        parseUnits("5", 18),
      ],
    });
  }
};

func.tags = ["InterestRateModel"];
func.skip = async hre =>
  hre.network.name !== "hardhat" && hre.network.name !== "bscmainnet" && hre.network.name !== "bsctestnet";

export default func;
