import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("XVSVaultProxy_Implementation", {
    contract: "XVSVault",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("XVSVaultProxy", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("XVSStore", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
};

func.tags = ["xvs-vault"];

export default func;
