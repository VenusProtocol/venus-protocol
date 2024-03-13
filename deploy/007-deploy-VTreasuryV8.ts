import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface AdminAccounts {
  [key: string]: string;
}
const acmAdminAccount: AdminAccounts = {
  sepolia: "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb", // SEPOLIA MULTISIG
  ethereum: "0x285960C5B22fD66A736C7136967A3eB15e93CC67", // ETHEREUM MULTISIG
  opbnbtestnet: "0xb15f6EfEbC276A3b9805df81b5FB3D50C2A62BDf", // OPBNBTESTNET MULTISIG
  opbnbmainnet: "0xC46796a21a3A9FAB6546aF3434F2eBfFd0604207", // OPBNBMAINNET MULTISIG
  kavatestnet: "0x803cEfC7Aae31eF1de021bEAA1Cd94CCcaAaBA21", // KAVATESTNET MULTISIG
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);
  const treasuryInstance = await deploy("VTreasuryV8", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  console.log("Transferring owner to venus admin account");
  const adminAccount: string = acmAdminAccount[hre.network.name];
  const VTreasuryV8 = await ethers.getContractAt("VTreasuryV8", treasuryInstance.address);
  const tx = await VTreasuryV8.connect(deployerSigner).transferOwnership(adminAccount);
  tx.wait();
  console.log("Ownership Transffered to: ", await VTreasuryV8.owner());
};

func.tags = ["VTreasuryV8"];

export default func;
