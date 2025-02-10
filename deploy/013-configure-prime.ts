import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network } = hre;

  const adminAccount: AdminAccounts = {
    sepolia: "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb", // SEPOLIA MULTISIG
    ethereum: "0x285960C5B22fD66A736C7136967A3eB15e93CC67", // ETHEREUM MULTISIG
    opbnbtestnet: "0xb15f6EfEbC276A3b9805df81b5FB3D50C2A62BDf", // OPBNBTESTNET MULTISIG
    opbnbmainnet: "0xC46796a21a3A9FAB6546aF3434F2eBfFd0604207", // OPBNBMAINNET MULTISIG
    arbitrumsepolia: "0x1426A5Ae009c4443188DA8793751024E358A61C2", // ARBITRUM SEPOLIA MULTISIG
    arbitrumone: "0x14e0E151b33f9802b3e75b621c1457afc44DcAA0", // ARBITRUM ONE MULTISIG
    zksyncsepolia: "0xa2f83de95E9F28eD443132C331B6a9C9B7a9F866", // ZKSYNC SEPOLIA MULTISIG
    zksyncmainnet: "0x751Aa759cfBB6CE71A43b48e40e1cCcFC66Ba4aa", // ZKSYNC MAINNET MULTISIG
    opsepolia: "0xd57365EE4E850e881229e2F8Aa405822f289e78d", // OPSEPOLIA MULTISIG
    opmainnet: "0x2e94dd14E81999CdBF5deDE31938beD7308354b3", // OPMAINNET MULTISIG
    unichainsepolia: "0x9831D3A641E8c7F082EEA75b8249c99be9D09a34", // UNICHAIN SEPOLIA MULTISIG
    basesepolia: "0xdf3b635d2b535f906BB02abb22AED71346E36a00", // BASE SEPOLIA MULTISIG
    basemainnet: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C", // BASE MAINNET MULTISIG
    unichainmainnet: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C", // UNICHAIN MAINNET MULTISIG
    bscmainnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    bsctestnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
  };

  const prime = await ethers.getContract("Prime");
  const plp = await ethers.getContract("PrimeLiquidityProvider");

  if (network.name !== "hardhat") {
    console.log("Transferring Prime ownership to Timelock");
    await prime.transferOwnership(adminAccount[network.name]);

    console.log("Transferring PLP ownership to Timelock");
    await plp.transferOwnership(adminAccount[network.name]);
  }
};

func.tags = ["Prime"];
func.id = "configure_prime"; // id required to prevent re-execution

export default func;
