import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { assertKnownChain } from "../helpers/chains";
import { tokens } from "../helpers/tokens";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts }: any = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chain = assertKnownChain(hre.network.name);
  const tokensConfig = Object.values(tokens[chain]);

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
