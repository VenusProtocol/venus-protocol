import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { tokensConfig } = await getConfig(hre.network.name);

  for (const token of tokensConfig) {
    if (token.isMock) {
      const contractName = `Mock${token.symbol}`;
      await deploy(contractName, {
        from: deployer,
        contract: "MockToken",
        args: [token.name, token.symbol, token.decimals],
        log: true,
        autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
        skipIfAlreadyDeployed: true,
      });
    }
  }
};

func.tags = ["MockTokens"];

export default func;
