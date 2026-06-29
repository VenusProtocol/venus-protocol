import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { assertBlockBasedChain, blocksPerYear as chainBlocksPerYear } from "../helpers/chains";
import { skipRemoteNetworks } from "../helpers/deploymentConfig";
import { getRateModelName } from "../helpers/rateModelHelpers";

// Phase-4 market-deprecation "push-out" interest rate model for the BNB Core (legacy) pool.
// Flat 300% borrow rate below the 45% kink, ramping to a 500% maximum at full utilization.
// The downstream VIP repoints the deprecated BNB Core markets to this model via _setInterestRateModel.
const DEPRECATION_RATE_MODEL = {
  model: "jump" as const,
  baseRatePerYear: parseUnits("3", 18), // 300%
  multiplierPerYear: parseUnits("0", 18), // 0% (flat below kink)
  jumpMultiplierPerYear: parseUnits("3.6364", 18), // 363.64% -> 500% max at 100% util
  kink: parseUnits("0.45", 18), // 0.45
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const chain = assertBlockBasedChain(hre.network.name);

  // BNB Core (legacy JumpRateModel) lives on BSC only.
  if (chain !== "bscmainnet" && chain !== "bsctestnet") {
    return;
  }

  const { deployer } = await getNamedAccounts();
  const blocksPerYear = chainBlocksPerYear[chain];
  const rateModelName = getRateModelName(DEPRECATION_RATE_MODEL, blocksPerYear);

  const constructorArguments = [
    DEPRECATION_RATE_MODEL.baseRatePerYear,
    DEPRECATION_RATE_MODEL.multiplierPerYear,
    DEPRECATION_RATE_MODEL.jumpMultiplierPerYear,
    DEPRECATION_RATE_MODEL.kink,
    blocksPerYear,
  ];

  console.log(`Deploying BNB Core deprecation interest rate model ${rateModelName}`);

  const irm = await deploy(rateModelName, {
    from: deployer,
    contract: "JumpRateModel",
    args: constructorArguments,
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  // Verify on the block explorer (live networks only; no-op on hardhat/forks).
  if (network.live) {
    try {
      await hre.run("verify:verify", {
        address: irm.address,
        constructorArguments,
      });
    } catch (error) {
      console.error(`Verification failed for ${rateModelName} at ${irm.address}:`, error);
    }
  }
};

func.tags = ["BNBCoreDeprecationIRM"];
func.skip = skipRemoteNetworks();

export default func;
