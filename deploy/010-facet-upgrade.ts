import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("Unitroller_Implementation", {
    contract: "Diamond",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("PolicyFacet", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("SetterFacet", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("MarketFacet", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("RewardFacet", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("FlashLoanFacet", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
};

func.tags = ["FacetUpgrade"];

export default func;
