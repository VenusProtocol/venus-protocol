import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  const vBNBDeployment = await deployments.get("vBNB");
  const comptrollerDeployment = await deployments.get("Unitroller");
  const timelock = await deployments.get("NormalTimelock");

  // Explicitly mentioning Default Proxy Admin contract path to fetch it from hardhat-deploy instead of OpenZeppelin
  // as zksync doesnot compile OpenZeppelin contracts using zksolc. It is backward compatible for all networks as well.
  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );

  await deploy("CollateralSwapper", {
    from: deployer,
    log: true,
    args: [comptrollerDeployment.address, vBNBDeployment.address],
    proxy: {
      owner: network.name === "hardhat" ? deployer : timelock.address,
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
    },
  });

  const collateralSwapper = await ethers.getContract("CollateralSwapper");

  await deploy("WBNBSwapHelper", {
    from: deployer,
    args: [collateralSwapper.address, WBNB_ADDRESS],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  console.log("Transferring ownership to Normal Timelock ....");
  const tx = await collateralSwapper.transferOwnership(timelock.address);
  await tx.wait();
  console.log("Ownership transferred to Normal Timelock");
};

func.tags = ["collateralSwapper"];

func.skip = async hre => !["bsctestnet", "bscmainnet"].includes(hre.network.name);

export default func;
