import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { assertBlockBasedChain, blocksPerYear as chainBlocksPerYear } from "../helpers/chains";
import { skipRemoteNetworks } from "../helpers/deploymentConfig";
import { markets } from "../helpers/markets";
import { getRateModelName } from "../helpers/rateModelHelpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const chain = assertBlockBasedChain(hre.network.name);

  const { deployer } = await getNamedAccounts();

  // Keeping this hardcoded since 003-deploy-VBep20 (used in subgraph tests) depends on it
  if (!network.live) {
    await deploy("InterestRateModelVUSDC", {
      contract: "JumpRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [0, "50000000000000000", "1090000000000000000", "800000000000000000"],
    });

    await deploy("InterestRateModelVETH", {
      contract: "JumpRateModel",
      from: deployer,
      log: true,
      autoMine: true,
      args: [0, "40000000000000000", "1080000000000000000", "700000000000000000"],
    });
  }

  const marketsConfig = markets[chain];
  const blocksPerYear = chainBlocksPerYear[chain];

  for (const market of marketsConfig) {
    const { interestRateModel, symbol } = market;
    const rateModelName = getRateModelName(interestRateModel, blocksPerYear);
    console.log(`Deploying interest rate model ${rateModelName} for ${symbol}`);

    if (interestRateModel.model === "whitepaper") {
      await deploy(rateModelName, {
        from: deployer,
        contract: "WhitePaperInterestRateModel",
        args: [
          interestRateModel.baseRatePerYear,
          interestRateModel.multiplierPerYear,
          //blocksPerYear
        ],
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: true,
      });
    } else if (interestRateModel.model === "jump") {
      await deploy(rateModelName, {
        from: deployer,
        contract: "JumpRateModel",
        args: [
          interestRateModel.baseRatePerYear,
          interestRateModel.multiplierPerYear,
          interestRateModel.jumpMultiplierPerYear,
          interestRateModel.kink,
          //blocksPerYear
        ],
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: true,
      });
    } else if (interestRateModel.model === "two-kinks") {
      await deploy(rateModelName, {
        contract: "TwoKinksInterestRateModel",
        from: deployer,
        args: [
          interestRateModel.baseRatePerYear,
          interestRateModel.multiplierPerYear,
          interestRateModel.kink,
          interestRateModel.multiplierPerYear2,
          interestRateModel.baseRatePerYear2,
          interestRateModel.kink2,
          interestRateModel.jumpMultiplierPerYear,
        ],
        log: true,
        autoMine: true,
        skipIfAlreadyDeployed: true,
      });
    }
  }
};

func.tags = ["InterestRateModel"];
func.skip = skipRemoteNetworks();

export default func;
