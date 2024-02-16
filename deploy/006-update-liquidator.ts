import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";

  const {
    unitroller: comptrollerAddress,
    vbnb: vbnbAddress,
    wbnb: wbnbAddress,
    normalVipTimelock: timelockAddress,
    acm: accessControlManagerAddress,
    treasury: treasuryAddress,
  } = ADDRESSES[networkName];
  const TREASURY_PERCENT = parseUnits("0.05", 18);

  await catchUnknownSigner(
    deploy("Liquidator", {
      contract: "Liquidator",
      from: deployer,
      args: [comptrollerAddress, vbnbAddress, wbnbAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner: timelockAddress,
        proxyContract: "OpenZeppelinTransparentProxy",
        execute: {
          methodName: "initialize",
          args: [TREASURY_PERCENT, accessControlManagerAddress, treasuryAddress],
        },
      },
    }),
  );
};

func.tags = ["liquidator-upgrade"];
export default func;
