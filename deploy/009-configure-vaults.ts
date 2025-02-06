import { ethers, network } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

interface Config {
  [key: string]: number;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const isTimeBased = false; // configure this value if time based deployment

  const blocksPerYear: Config = {
    bsctestnet: 10_512_000, // 3 sec per block
    sepolia: 2_628_000, // 12 sec per block
    arbitrumsepolia: 0, // time based deployment
    opsepolia: 0, // time based deployment
    opmainnet: 0, // time based deployment
    arbitrumone: 0, // time based deployment
    zksyncsepolia: 0, // time based deployment
    zksyncmainnet: 0, // time based deployment
    bscmainnet: 10_512_000,
    ethereum: 2_628_000,
    basesepolia: 0, // time based deployment
    basemainnet: 0, // time based deployment
    unichainmainnet: 0, // time based deployment
    hardhat: 100,
  };

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
    bscmainnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    bsctestnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    basesepolia: "0xdf3b635d2b535f906BB02abb22AED71346E36a00", // BASE SEPOLIA MULTISIG
    basemainnet: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C", // BASE MAINNET MULTISIG
    unichainmainnet: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C", // UNICHAIN MAINNET MULTISIG
    hardhat: deployer,
  };

  const accessControlManager = await ethers.getContract("AccessControlManager");

  const xvs = await ethers.getContract("XVS");
  const xvsVaultProxyDeployment = await ethers.getContract("XVSVaultProxy");
  const xvsStoreDeployment = await ethers.getContract("XVSStore");

  let xvsVault = await ethers.getContract("XVSVaultProxy_Implementation");
  await xvsVaultProxyDeployment._setPendingImplementation(xvsVault.address);
  await xvsVault._become(xvsVaultProxyDeployment.address);

  xvsVault = await ethers.getContractAt("XVSVault", xvsVaultProxyDeployment.address);

  let txn = await xvsVault.initializeTimeManager(isTimeBased, blocksPerYear[network.name]);
  await txn.wait();

  txn = await xvsVault.setXvsStore(xvs.address, xvsStoreDeployment.address);
  await txn.wait();

  txn = await xvsVault.setAccessControl(accessControlManager.address);
  await txn.wait();

  await xvsStoreDeployment.setNewOwner(xvsVaultProxyDeployment.address);

  if (!hre.network.live) {
    const tx = await accessControlManager.giveCallPermission(
      ethers.constants.AddressZero,
      "add(address,uint256,address,uint256,uint256)",
      deployer,
    );
    await tx.wait();

    // Add token pool to xvs vault
    const allocPoint = 100;
    const token = xvs.address;
    const rewardToken = xvs.address;
    const rewardPerBlock = "61805555555555555";
    const lockPeriod = 604800;

    await xvsVault.add(rewardToken, allocPoint, token, rewardPerBlock, lockPeriod);
  } else {
    const owner = adminAccount[hre.network.name];
    console.log("Please accept ownership of vault and store");
    txn = await xvsVaultProxyDeployment._setPendingAdmin(owner);
    await txn.wait();

    txn = await xvsStoreDeployment.setPendingAdmin(owner);
    await txn.wait();
  }
};

func.tags = ["xvs-vault"];
func.id = "xvs_vault_configuration"; // id required to prevent re-execution

export default func;
