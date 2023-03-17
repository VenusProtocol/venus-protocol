import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const ADDRESSES = {
  bsctestnet: {
    WBNBAddress: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    pancakeFactory: "0x182859893230dC89b114d6e2D547BFFE30474a21",
    comptrollerAddress: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
  },
  bscmainnet: {
    WBNBAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    pancakeFactory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    comptrollerAddress: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const WBNBAddress = ADDRESSES[networkName].WBNBAddress;
  const pancakeFactoryAddress = ADDRESSES[networkName].pancakeFactory;
  const comptrollerAddress = ADDRESSES[networkName].comptrollerAddress;

  await deploy("SwapRouter", {
    contract: "SwapRouter",
    from: deployer,
    args: [WBNBAddress, pancakeFactoryAddress],
    log: true,
    autoMine: true,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [comptrollerAddress],
      },
    },
  });
};

func.tags = ["SwapRouter"];

export default func;
