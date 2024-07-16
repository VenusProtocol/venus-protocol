import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// MAINNET DEPLOYED CONTRACTS
import Mainnet from "../deployments/bscmainnet.json";
// TESTNET DEPLOYED CONTRACTS
import Testnet from "../deployments/bsctestnet.json";
import { skipRemoteNetworks } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const unitrollerAddresses = (await deployments.get("Unitroller")).address;
  const wBNBAddress = (await deployments.get("WBNB")).address;

  const vbnbAddress = (await deployments.get("vBNB")).address;
  // Pancake Factory doesn't exist on hardhat so we are using the testnet address
  const pancakeFactoryAddress =
    hre.network.name === "bscmainnet"
      ? Mainnet.contracts.pancakeFactory.address
      : Testnet.contracts.pancakeFactory.address;

  await deploy("SwapRouterCorePool", {
    contract: "SwapRouter",
    from: deployer,
    args: [wBNBAddress, pancakeFactoryAddress, unitrollerAddresses, vbnbAddress],
    log: true,
    autoMine: true,
  });
};

func.tags = ["SwapRouter"];
// Pancake Factory is not deployed on the local network
func.skip = skipRemoteNetworks({ hardhat: false });

export default func;
