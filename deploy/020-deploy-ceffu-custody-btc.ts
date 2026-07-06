import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { skipRemoteNetworks } from "../helpers/deploymentConfig";

// Token parameters for the Ceffu Custody BTC receipt token.
const TOKEN_NAME = "Ceffu Custody BTC for Venus";
const TOKEN_SYMBOL = "vceBTC";
const TOKEN_DECIMALS = 18;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const acmAddress = (await deployments.get("AccessControlManager")).address;
  const normalTimelockAddress = (await deployments.get("NormalTimelock")).address;

  const constructorArguments = [TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, acmAddress];

  const ceffuCustodyBTC = await deploy("CeffuCustodyBTC", {
    contract: "VenusERC20",
    from: deployer,
    args: constructorArguments,
    log: true,
    autoMine: true,
  });

  const token = await ethers.getContractAt("VenusERC20", ceffuCustodyBTC.address);
  await token.transferOwnership(normalTimelockAddress);
  console.log(`CeffuCustodyBTC (${ceffuCustodyBTC.address}) ownership transfer initiated to ${normalTimelockAddress}`);

  if (network.live) {
    try {
      await hre.run("verify:verify", {
        address: ceffuCustodyBTC.address,
        constructorArguments,
      });
    } catch (error) {
      console.error(`Verification failed for CeffuCustodyBTC at ${ceffuCustodyBTC.address}:`, error);
    }
  }

  return hre.network.live;
};

func.id = "ceffu_custody_btc_initial_deploy";
func.tags = ["CeffuCustodyBTC"];
func.skip = skipRemoteNetworks();

export default func;
