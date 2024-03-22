import { BigNumber, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployFunction, DeployResult } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { InterestRateModels, getConfig, getTokenConfig } from "../helpers/deploymentConfig";

const mantissaToBps = (num: BigNumberish) => {
  return BigNumber.from(num).div(parseUnits("1", 14)).toString();
};

const VTOKEN_DECIMALS = 8;
const EMPTY_BYTES_ARRAY = "0x";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const { tokensConfig, marketsConfig, preconfiguredAddresses } = await getConfig(hre.network.name);

  const comptrollerDeployment = await deployments.get("Unitroller");

  console.log(`Got deployment of Unitroller with address: ${comptrollerDeployment.address}`);

  for (const market of marketsConfig) {
    const { name, asset, symbol, rateModel, baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_ } = market;

    const token = getTokenConfig(asset, tokensConfig);
    let tokenContract;
    if (token.isMock) {
      tokenContract = await ethers.getContract(`Mock${token.symbol}`);
    } else {
      tokenContract = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20",
        token.tokenAddress,
      );
    }

    let rateModelAddress: string;
    if (rateModel === InterestRateModels.JumpRate.toString()) {
      const [b, m, j, k] = [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_].map(mantissaToBps);
      const rateModelName = `JumpRateModel_base${b}bps_slope${m}bps_jump${j}bps_kink${k}bps`;
      console.log(`Deploying interest rate model ${rateModelName}`);
      const result: DeployResult = await deploy(rateModelName, {
        from: deployer,
        contract: "JumpRateModel",
        args: [baseRatePerYear, multiplierPerYear, jumpMultiplierPerYear, kink_],
        log: true,
      });
      rateModelAddress = result.address;
    } else {
      const [b, m] = [baseRatePerYear, multiplierPerYear].map(mantissaToBps);
      const rateModelName = `WhitePaperInterestRateModel_base${b}bps_slope${m}bps`;
      console.log(`Deploying interest rate model ${rateModelName}`);
      const result: DeployResult = await deploy(rateModelName, {
        from: deployer,
        contract: "WhitePaperInterestRateModel",
        args: [baseRatePerYear, multiplierPerYear],
        log: true,
      });
      rateModelAddress = result.address;
    }

    const underlyingDecimals = Number(await tokenContract.decimals());

    console.log(`Deploying VBep20 Proxy for ${symbol} with Implementation ${preconfiguredAddresses.VTokenImpl}`);

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
        preconfiguredAddresses.NormalTimelock,
        preconfiguredAddresses.VTokenImpl,
        EMPTY_BYTES_ARRAY,
      ],
      log: true,
    });
  }
};

func.tags = ["Markets"];
func.skip = async hre =>
  hre.network.name === "sepolia" ||
  hre.network.name === "opbnbtestnet" ||
  hre.network.name === "opbnbmainnet" ||
  hre.network.name === "ethereum";

export default func;
