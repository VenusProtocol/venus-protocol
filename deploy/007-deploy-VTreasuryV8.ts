import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface AdminAccounts {
  [key: string]: string;
}
const acmAdminAccount: AdminAccounts = {
  sepolia: "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb", // SEPOLIA MULTISIG
  ethereum: "", // TODO: add Ethereum MULTISIG once it is deployed
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