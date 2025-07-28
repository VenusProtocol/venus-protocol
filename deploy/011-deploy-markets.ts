import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { network } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { assertBlockBasedChain, blocksPerYear as chainBlocksPerYear } from "../helpers/chains";
import { skipRemoteNetworks } from "../helpers/deploymentConfig";
import { markets } from "../helpers/markets";
import { getRateModelName } from "../helpers/rateModelHelpers";

const VTOKEN_DECIMALS = 8;
const EMPTY_BYTES_ARRAY = "0x";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chain = assertBlockBasedChain(hre.network.name);
  const marketsConfig = markets[chain];
  const blocksPerYear = chainBlocksPerYear[chain];

  const comptrollerDeployment = await deployments.get("Unitroller");

  console.log(`Got deployment of Unitroller with address: ${comptrollerDeployment.address}`);

  for (const market of marketsConfig) {
    const { name, asset, symbol, interestRateModel, flashloanConfig } = market;

    // Short-circuit to avoid extra requests to the node if vToken already exists
    const deployment = await deployments.getOrNull(symbol);
    if (deployment !== null && deployment !== undefined) {
      console.log(`Skipping ${symbol} deployment: found at ${deployment.address}`);
      continue;
    }

    let tokenContract;
    if (asset.isMock) {
      tokenContract = await ethers.getContract(`Mock${asset.symbol}`);
    } else {
      tokenContract = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
        asset.tokenAddress,
      );
    }

    const rateModelName = getRateModelName(interestRateModel, blocksPerYear);
    const rateModelAddress = (await deployments.get(rateModelName)).address;

    const underlyingDecimals = Number(await tokenContract.decimals());
    const normalTimelock = await ethers.getContract("NormalTimelock");
    const vBep20DelegateDeployment = await deploy("VBep20Delegate", { from: deployer, skipIfAlreadyDeployed: true });
    console.log(`Deploying VBep20 Proxy for ${symbol} with Implementation ${vBep20DelegateDeployment.address}`);

    await deploy(`${symbol}`, {
      contract: "VBep20Delegator",
      from: deployer,
      args: [
        tokenContract.address,
        comptrollerDeployment.address,
        rateModelAddress,
        parseUnits("1", underlyingDecimals + 18 - VTOKEN_DECIMALS),
        name,
        symbol,
        VTOKEN_DECIMALS,
        network.live ? normalTimelock.address : deployer,
        vBep20DelegateDeployment.address,
        EMPTY_BYTES_ARRAY
      ],
      log: true,
      skipIfAlreadyDeployed: true,
    });
  }
};

func.tags = ["Markets"];
func.skip = skipRemoteNetworks();

export default func;
