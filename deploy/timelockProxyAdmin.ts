import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const TIMELOCK_PROXY_OWNER: { [key: string]: string } = {
    hardhat: deployer,
    bsctestnet: "0xce10739590001705F7FF231611ba4A48B2820327",
    bscmainnet: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
  };

  await deploy("TimelockProxyAdmin", {
    contract: "ProxyAdmin",
    from: deployer,
    args: [TIMELOCK_PROXY_OWNER[network.name]],
    log: true,
    autoMine: true,
  });
};

func.tags = ["TimelockProxyAdmin"];

export default func;
