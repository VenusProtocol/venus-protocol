import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  const vUSDC = await deployments.get("vUSDC");
  const vETH = await deployments.get("vETH");

  const comptrollerDeployment = await deployments.get("Comptroller");
  const comptroller = await ethers.getContractAt("Comptroller", comptrollerDeployment.address);

  await comptroller.connect(deployerSigner)._supportMarket(vUSDC.address);
  await comptroller.connect(deployerSigner)._supportMarket(vETH.address);
};

func.tags = ["VBep20"];

export default func;
