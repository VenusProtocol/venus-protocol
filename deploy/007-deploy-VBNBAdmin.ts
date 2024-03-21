import deployPSR from "@venusprotocol/protocol-reserve/dist/deploy/001-psr";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Ensure PSR is deployed
  await deployPSR(hre);

  const wBNBAddress = (await deployments.get("WBNB")).address;
  const vBNBAddress = (await deployments.get("vBNB")).address;
  const acmAddress = (await deployments.get("AccessControlManager")).address;
  const protocolShareReserveAddress = (await deployments.get("ProtocolShareReserve")).address;
  const normalVipTimelockAddress = (await deployments.get("NormalTimelock")).address;

  await deploy("VBNBAdmin", {
    contract: "VBNBAdmin",
    from: deployer,
    args: [vBNBAddress, wBNBAddress],
    log: true,
    autoMine: true,
    proxy: {
      owner: network.name === "hardhat" ? deployer : normalVipTimelockAddress,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [protocolShareReserveAddress, acmAddress],
      },
    },
  });

  const vBNBAdmin = await ethers.getContract("VBNBAdmin");

  if (network.name !== "hardhat") {
    await vBNBAdmin.transferOwnership(normalVipTimelockAddress);
    console.log(
      `VBNBAdmin Contract (${vBNBAdmin.address}) owner changed from ${deployer} to ${normalVipTimelockAddress}`,
    );
  }
  return hre.network.live; // when live network, record the script as executed to prevent re-execution
};

func.id = "vbnbadmin_deploy"; // id required to prevent re-execution
func.tags = ["VBNBAdmin"];
func.skip = async hre =>
  hre.network.name === "sepolia" ||
  hre.network.name === "opbnbtestnet" ||
  hre.network.name === "opbnbmainnet" ||
  hre.network.name === "ethereum";

export default func;
