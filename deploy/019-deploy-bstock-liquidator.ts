import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  // Core Comptroller (diamond) + the three BNB-debt immutables. vBNB is the native market (detected as
  // BNB debt), vWBNB is the ERC20 flash-borrow source (vBNB itself cannot be flash-repaid), and WBNB is
  // the debt-accounting token unwrapped for the native repay. The immutable vBNB MUST match the address
  // the pool-wide Liquidator gate is configured with, else the gate takes its BEP20 branch and reverts.
  const comptrollerAddress = (await deployments.get("Unitroller")).address;
  const vBnbAddress = (await deployments.get("vBNB")).address;
  const vWbnbAddress = (await deployments.get("vWBNB")).address;
  const wBnbAddress = (await deployments.get("WBNB")).address;
  const timelockAddress = (await deployments.get("NormalTimelock")).address;

  const owner = network.name === "hardhat" ? deployer : timelockAddress;

  await catchUnknownSigner(
    deploy("BStockLiquidator", {
      contract: "BStockLiquidator",
      from: deployer,
      args: [comptrollerAddress, vBnbAddress, vWbnbAddress, wBnbAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner,
        proxyContract: "OpenZeppelinTransparentProxy",
        execute: {
          methodName: "initialize",
          args: [owner],
        },
      },
    }),
  );
};

func.tags = ["bstock-liquidator"];
// bStock (RFQ-only via Native) and the vWBNB flash source are bscmainnet-only; wire the vBNB/vWBNB/WBNB
// deployments before enabling this on any other network.
func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.name !== "bscmainnet";

export default func;
