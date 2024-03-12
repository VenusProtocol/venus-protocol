import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface AdminAccounts {
  [key: string]: string;
}


const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const getTimelock = async() => {
    switch (hre.network.name) {
      case ('bsctestnet'):
      case ('bscmainnet'): {
        const timelock = await deployments.get('NormalTimelock')
        return timelock.address
      }
    }
    return '';
  }

  const acmAdminAccount: AdminAccounts = {
    sepolia: "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb", // SEPOLIA MULTISIG
    ethereum: "0x285960C5B22fD66A736C7136967A3eB15e93CC67", // ETHEREUM MULTISIG
    opbnbtestnet: "0xb15f6EfEbC276A3b9805df81b5FB3D50C2A62BDf", // OPBNBTESTNET MULTISIG
    opbnbmainnet: "0xC46796a21a3A9FAB6546aF3434F2eBfFd0604207", // OPBNBMAINNET MULTISIG
    bscmainnet: await getTimelock(),
    bsctestnet: await getTimelock(),
    hardhat: deployer,
  };

  const deployerSigner = await hre.ethers.getSigner(deployer);
  const treasuryInstance = await deploy("VTreasury", {
    contract: "VTreasuryV8",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const adminAccount: string = acmAdminAccount[hre.network.name];

  const VTreasuryV8 = await ethers.getContractAt("VTreasury", treasuryInstance.address);

  if ((await VTreasuryV8.owner()) != adminAccount) {
    console.log("Transferring owner to venus admin account");
    const tx = await VTreasuryV8.connect(deployerSigner).transferOwnership(adminAccount);
    tx.wait();
    console.log("Ownership Transffered to: ", await VTreasuryV8.owner());
  }
};

func.tags = ["VTreasuryV8"];

export default func;
