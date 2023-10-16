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

  const protocolShareReserve: { [network: string]: string } = {
    bsctestnet: "0x25c7c7D6Bf710949fD7f03364E9BA19a1b3c10E3",
    bscmainnet: "0xCa01D5A9A248a830E9D93231e791B1afFed7c446",
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
        args: [protocolShareReserve[networkName], acmAddresses[networkName]],
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
