import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const capitalize = (s: string) => `${s.charAt(0).toUpperCase()}${s.substring(1)}`;

const getSetterContractName = (networkName: string) => `SetCheckpoint${capitalize(networkName)}`;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chain = hre.getNetworkName();

  await deploy(getSetterContractName(chain), {
    contract: getSetterContractName(chain),
    from: deployer,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

func.tags = ["RateModelCheckpointSetter"];
func.skip = async hre => !["bsctestnet", "bscmainnet"].includes(hre.network.name);

export default func;
