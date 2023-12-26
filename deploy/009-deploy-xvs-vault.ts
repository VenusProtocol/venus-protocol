import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface NetworkConfig {
  useBlocks: boolean;
  blocksPerYear?: number;
}

const networkConfig: { [key: string]: NetworkConfig } = {
  bsctestnet: {
    useBlocks: true,
    blocksPerYear: 10512000,
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkArgs = networkConfig[hre.network.name];
  const xvsVaultArgs = networkArgs.useBlocks ? [false, networkArgs.blocksPerYear] : [true, 0];

  await deployments.delete("XVSVault");

  await deploy("XVSVault", {
    from: deployer,
    args: xvsVaultArgs,
    log: true,
    autoMine: true,
  });
};

func.tags = ["xvs-vault"];

export default func;
