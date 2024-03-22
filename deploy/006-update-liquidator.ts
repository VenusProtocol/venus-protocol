import { parseUnits } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();
  const comptrollerAddress = (await deployments.get("Unitroller")).address;
  const accessControlManagerAddress = (await deployments.get("AccessControlManager")).address;
  const treasuryAddress = (await deployments.get(hre.network.name.includes("bsc") ? "VTreasury" : "VTreasuryV8"))
    .address;
  const timelockAddress = (await deployments.get("NormalTimelock")).address;

  const vbnbAddress = (await deployments.get("vBNB")).address;
  const wbnbAddress = (await deployments.get("WBNB")).address;

  const TREASURY_PERCENT = parseUnits("0.05", 18);

  await catchUnknownSigner(
    deploy("Liquidator", {
      contract: "Liquidator",
      from: deployer,
      args: [comptrollerAddress, vbnbAddress, wbnbAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner: network.name === "hardhat" ? deployer : timelockAddress,
        proxyContract: "OpenZeppelinTransparentProxy",
        execute: {
          methodName: "initialize",
          args: [TREASURY_PERCENT, accessControlManagerAddress, treasuryAddress],
        },
      },
    }),
  );
};

func.tags = ["liquidator-upgrade"];
func.skip = async hre =>
  hre.network.name === "sepolia" ||
  hre.network.name === "opbnbtestnet" ||
  hre.network.name === "opbnbmainnet" ||
  hre.network.name === "ethereum";

export default func;
