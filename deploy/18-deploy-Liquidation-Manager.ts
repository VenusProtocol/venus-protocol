import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const accessControlManagerAddress = (await deployments.get("AccessControlManager")).address;

  const baseCloseFactorMantissa = parseUnits("0.05", 18); // e.g., 5%
  const defaultCloseFactorMantissa = parseUnits("0.5", 18); // e.g., 50%
  const targetHealthFactor = parseUnits("1.1", 18); // e.g., 110%

  await deploy("LiquidationManager", {
    from: deployer,
    args: [baseCloseFactorMantissa, defaultCloseFactorMantissa, targetHealthFactor],
    log: true,
  });

  // Optionally, initialize with access control manager if needed
  const liquidationManager = await deployments.get("LiquidationManager");
  const contract = await hre.ethers.getContractAt("LiquidationManager", liquidationManager.address);
  const tx = await contract.initialize(accessControlManagerAddress);
  await tx.wait();
};

func.tags = ["LiquidationManager"];
export default func;
