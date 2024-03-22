import deployOracle from "@venusprotocol/oracle/dist/deploy/1-deploy-oracles";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Ensure oracles are deployed
  await deployOracle(hre);

  const usdtAddress = (await deployments.get("USDT")).address;
  const acmAddress = (await deployments.get("AccessControlManager")).address;
  const treasuryAddress = (await deployments.get(hre.network.name == "hardhat" ? "VTreasuryV8" : "VTreasury")).address;
  const oracleAddress = (await deployments.get("ResilientOracle")).address;

  let normalVipTimelockAddress;
  if (hre.network.name === "hardhat") {
    normalVipTimelockAddress = (
      await deploy("NormalTimelock", {
        contract: "TestTimelockV8",
        from: deployer,
        args: [deployer, 600],
        log: true,
        autoMine: true,
      })
    ).address;
  } else {
    // We should be able to fetch the deployed contract from the governance network on live networks
    normalVipTimelockAddress = (await deployments.get("NormalTimelock")).address;
  }

  const vaiAddress = (
    await deploy("VAI", {
      from: deployer,
      args: [await getChainId()],
      log: true,
      autoMine: true,
    })
  ).address;

  const FEE_IN = 0;
  const FEE_OUT = 0;
  const VAI_MINT_CAP = parseUnits("5000000", 18); // 5M

  await deploy("PegStability_USDT", {
    contract: "PegStability",
    from: deployer,
    args: [usdtAddress, vaiAddress],
    log: true,
    autoMine: true,
    proxy: {
      owner: network.name === "hardhat" ? deployer : normalVipTimelockAddress,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddress, treasuryAddress, oracleAddress, FEE_IN, FEE_OUT, VAI_MINT_CAP],
      },
    },
  });

  const psm = await ethers.getContract("PegStability_USDT");

  if (network.name !== "hardhat") {
    const timelockAddress = normalVipTimelockAddress;
    await psm.transferOwnership(timelockAddress);
    console.log(`PSM Contract (${psm.address}) owner changed from ${deployer} to ${timelockAddress}`);
  }
  return hre.network.live; // when live network, record the script as executed to prevent re-execution
};

func.id = "psm_initial_deploy"; // id required to prevent re-execution
func.tags = ["PSM"];
func.skip = async hre =>
  hre.network.name !== "bscmainnet" && hre.network.name !== "bsctestnet" && hre.network.name !== "hardhat";

export default func;
