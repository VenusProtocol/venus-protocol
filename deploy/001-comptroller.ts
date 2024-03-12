import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { network } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  if (!network.live) {
    const accessControlManagerDeployment = await deploy("AccessControlManager", {
      from: deployer,
      args: [],
      log: true,
      autoMine: true,
    });
    const comptrollerDeployment = await deploy("Unitroller", {
      contract: "ComptrollerMock",
      from: deployer,
      log: true,
      autoMine: true,
      args: [],
    });
    const accessControlManager = await ethers.getContractAt(
      "AccessControlManager",
      accessControlManagerDeployment.address,
    );
    const comptroller = await ethers.getContractAt("ComptrollerMock", comptrollerDeployment.address);

    await accessControlManager.giveCallPermission(ethers.constants.AddressZero, "_supportMarket(address)", deployer);

    await accessControlManager.giveCallPermission(
      ethers.constants.AddressZero,
      "_setLiquidationIncentive(uint256)",
      deployer,
    );

    await comptroller.connect(deployerSigner)._setAccessControl(accessControlManager.address);
    await comptroller.connect(deployerSigner)._setLiquidationIncentive(parseUnits("5", 18));
  }
};

func.tags = ["Comptroller"];

export default func;
