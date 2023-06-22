import { parseUnits } from "ethers/lib/utils";
import { artifacts, ethers } from "hardhat";
import { Address, DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Contracts as Mainnet } from "../networks/mainnet.json";
import { Contracts as Testnet } from "../networks/testnet.json";

interface AddressConfig {
  [key: string]: {
    [key: string]: Address;
  };
}

const ADDRESSES: AddressConfig = {
  bsctestnet: Testnet,
  bscmainnet: Mainnet,
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";

  const vUSDTAddress = ADDRESSES[networkName].vUSDT;
  const VAIAddress = ADDRESSES[networkName].VAI;

  await catchUnknownSigner(
    deploy("PegStability_USDT", {
      contract: "PegStability",
      from: deployer,
      args: [vUSDTAddress, VAIAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner: ADDRESSES[networkName].Timelock,
        proxyContract: "OpenZeppelinTransparentProxy",
      },
    }),
  );
};

func.tags = ["PSM"];
export default func;
