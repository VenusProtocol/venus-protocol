import { ethers } from "hardhat";
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
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const vBNB = ADDRESSES[networkName].vBNB;
  const WBNB = ADDRESSES[networkName].WBNB;

  const acmAddresses: { [network: string]: string } = {
    bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
    bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  };

  const treasuryAddresses: { [network: string]: string } = {
    bsctestnet: "0x8b293600C50D6fbdc6Ed4251cc75ECe29880276f",
    bscmainnet: "0xF322942f644A996A617BD29c16bd7d231d9F35E9",
  };

  await deploy("VBNBAdmin", {
    contract: "VBNBAdmin",
    from: deployer,
    args: [vBNB, WBNB],
    log: true,
    autoMine: true,
    proxy: {
      owner: ADDRESSES[networkName].Timelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddresses[networkName], treasuryAddresses[networkName]],
      },
    },
  });

  const vBNBAdmin = await ethers.getContract("VBNBAdmin");

  if (network.name !== "hardhat") {
    const timelockAddress = ADDRESSES[networkName].Timelock;
    await vBNBAdmin.transferOwnership(timelockAddress);
    console.log(`VBNBAdmin Contract (${vBNBAdmin.address}) owner changed from ${deployer} to ${timelockAddress}`);
  }
  return hre.network.live; // when live network, record the script as executed to prevent rexecution
};

func.id = "vbnbadmin_deploy"; // id required to prevent re-execution
func.tags = ["VBNBAdmin"];

export default func;
