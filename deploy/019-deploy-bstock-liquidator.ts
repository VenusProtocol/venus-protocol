import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// OPERATIONAL owner of the bStock backstop (setRouter / setOperator / sweep / sweepNative). The Safe
// owns the contract from t0, so there is no transient EOA ownership over a fund-custody contract.
const BSTOCK_LIQUIDATOR_OWNER = "0x83f426233B358A36953F6951161E76FB7c866a7A";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  // Constructor immutables. vBNB is the native BNB market (a debt equal to it is settled in native BNB);
  // vWBNB is the ERC20 flash-borrow source for BNB debt (vBNB itself cannot be flash-repaid); WBNB is the
  // debt-accounting token unwrapped for the native repay. The immutable vBNB MUST match the address the
  // pool-wide Liquidator gate is configured with, else the gate takes its BEP20 branch and reverts.
  const comptrollerAddress = (await deployments.get("Unitroller")).address;
  const vBnbAddress = (await deployments.get("vBNB")).address;
  const vWbnbAddress = (await deployments.get("vWBNB")).address;
  const wBnbAddress = (await deployments.get("WBNB")).address;

  // Two distinct authorities:
  //   - proxy admin (UPGRADE rights) -> Venus governance timelock, changed via a VIP.
  //   - Ownable owner (OPERATIONAL admin) -> the bStock owner Safe, set directly in `initialize`.
  // On hardhat both collapse to the deployer so tests can drive them.
  const timelockAddress = (await deployments.get("NormalTimelock")).address;
  const proxyAdmin = network.name === "hardhat" ? deployer : timelockAddress;
  const contractOwner = network.name === "hardhat" ? deployer : BSTOCK_LIQUIDATOR_OWNER;

  await catchUnknownSigner(
    deploy("BStockLiquidator", {
      contract: "BStockLiquidator",
      from: deployer,
      args: [comptrollerAddress, vBnbAddress, vWbnbAddress, wBnbAddress],
      log: true,
      autoMine: true,
      proxy: {
        owner: proxyAdmin,
        proxyContract: "OpenZeppelinTransparentProxy",
        execute: {
          methodName: "initialize",
          args: [contractOwner],
        },
      },
    }),
  );

  // Verify the implementation on the block explorer (BscScan). The proxy is a standard OZ transparent
  // proxy the explorer recognizes; only the implementation carries the constructor args. Non-fatal — a
  // failure (e.g. already verified, or no API key) is logged, not thrown, so it never blocks the deploy.
  if (network.live) {
    const impl = await deployments.get("BStockLiquidator_Implementation");
    try {
      await hre.run("verify:verify", {
        address: impl.address,
        constructorArguments: [comptrollerAddress, vBnbAddress, vWbnbAddress, wBnbAddress],
      });
    } catch (err) {
      console.warn(`BscScan verify skipped/failed for ${impl.address}: ${(err as Error).message}`);
    }
  }

  // POST-DEPLOY (executed by the owner Safe, since it owns the contract from t0):
  //   1. setRouter(nativeRfqRouter, true)      — hop-1 Native RFQ router (bStock -> USDT)
  //   2. setRouter(ammRouter, true)            — hop-2 AMM/aggregator router(s) for non-USDT / BNB debt
  //   3. setOperator(operatorKey, true)        — each liquidation-bot key (or each Safe signer)
  // These are onlyOwner, so they cannot run here (deployer is not the owner); ship them as a Safe batch.

  return hre.network.live; // record as executed on a live network to prevent re-execution
};

func.id = "bstock_liquidator_deploy"; // id required to prevent re-execution
func.tags = ["bstock-liquidator", "BStockLiquidator"];
func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.name !== "bscmainnet";

export default func;
