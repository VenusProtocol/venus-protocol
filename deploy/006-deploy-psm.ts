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
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const vUSDTAddress = ADDRESSES[networkName].vUSDT;
  const VAIAddress = ADDRESSES[networkName].VAI;
  const FEE_IN = 0;
  const FEE_OUT = 10; // 10bps
  const VAI_MINT_CAP = parseUnits("5000000", 18); // 5M

  const treasuryAddresses: { [network: string]: string } = {
    bsctestnet: "0xFEA1c651A47FE29dB9b1bf3cC1f224d8D9CFF68C", // one of testnet admin accounts
    bscmainnet: "0xF322942f644A996A617BD29c16bd7d231d9F35E9", // Venus Treasury
  };

  const acmAddresses: { [network: string]: string } = {
    bsctestnet: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
    bscmainnet: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  };

  await deploy("PegStability_USDT", {
    contract: "PegStability",
    from: deployer,
    args: [vUSDTAddress, VAIAddress],
    log: true,
    autoMine: true,
    proxy: {
      owner: ADDRESSES[networkName].Timelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          acmAddresses[networkName],
          treasuryAddresses[networkName],
          ADDRESSES[networkName].Unitroller,
          FEE_IN,
          FEE_OUT,
          VAI_MINT_CAP,
        ],
      },
    },
  });

  const psm = await ethers.getContract("PegStability_USDT");

  if (network.name !== "hardhat") {
    const timelockAddress = ADDRESSES[networkName].Timelock;
    await psm.transferOwnership(timelockAddress);
    console.log(`PSM Contract (${psm.address}) owner changed from ${deployer} to ${timelockAddress}`);
  }
  return hre.network.live; // when live network, record the script as executed to prevent rexecution
};

func.id = "psm_initial_deploy"; // id required to prevent re-execution
func.tags = ["PSM"];

export default func;
