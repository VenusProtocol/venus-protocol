import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Diamond implementation (V19 storage — adds deviationBoundedOracle slot)
  await deploy("Unitroller_Implementation", {
    contract: "Diamond",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  // All 5 facets — all inherit FacetBase which changed
  // (new _updateProtectionStates, redeemAllowedInternal view→non-view, V19 storage)
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

  // ComptrollerLens — standalone contract (not a facet)
  // _calculateAccountPosition now uses DBO bounded prices in CF path
  await deploy("ComptrollerLens", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
};

func.tags = ["DBOUpgrade"];

export default func;
