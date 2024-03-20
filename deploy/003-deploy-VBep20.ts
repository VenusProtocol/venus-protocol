import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("USDT", {
    contract: "MockToken",
    from: deployer,
    args: ["Tether", "USDT", 18],
    log: true,
    autoMine: true,
  });

  const usdcDeployment = await deploy("USDC", {
    contract: "MockToken",
    from: deployer,
    args: ["US Dollar coin", "USDC", 18],
    log: true,
    autoMine: true,
  });

  await deploy("WBNB", {
    contract: "MockToken",
    from: deployer,
    args: ["Wrapped BNB", "WBNB", 18],
    log: true,
    autoMine: true,
  });

  const ethDeployment = await deploy("ETH", {
    contract: "MockToken",
    from: deployer,
    args: ["Ethereum", "ETH", 18],
    log: true,
    autoMine: true,
  });

  const comptrollerDeployment = await deployments.get("Unitroller");

  const interestRateModelVUSDCDeployment = await deployments.get("InterestRateModelVUSDC");
  await deploy("vUSDC", {
    contract: "VBep20Immutable",
    from: deployer,
    args: [
      usdcDeployment.address,
      comptrollerDeployment.address,
      interestRateModelVUSDCDeployment.address,
      "2000000000000000000",
      "Venus USDC",
      "vUSDC",
      18,
      deployer,
    ],
    log: true,
    autoMine: true,
  });

  await deploy("vETH", {
    contract: "VBep20Immutable",
    from: deployer,
    args: [
      ethDeployment.address,
      comptrollerDeployment.address,
      interestRateModelVUSDCDeployment.address,
      "1500000000000000000",
      "Venus Ethereum",
      "vETH",
      18,
      deployer,
    ],
    log: true,
    autoMine: true,
  });

  await deploy("vBNB", {
    contract: "VBNB",
    from: deployer,
    args: [
      comptrollerDeployment.address,
      interestRateModelVUSDCDeployment.address,
      "1500000000000000000",
      "Venus BNB",
      "vBNB",
      18,
      deployer,
    ],
    log: true,
    autoMine: true,
  });
};

func.tags = ["VBep20"];
// The deployed contracts are mocks so we only run this locally
func.skip = async hre => hre.network.name !== "hardhat";

export default func;
