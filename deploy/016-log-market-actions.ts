import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const allVTokens = {
  vUSDC: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8",
  vUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
  vBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
  vSXP: "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0",
  vXVS: "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D",
  vBTC: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B",
  vETH: "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8",
  vLTC: "0x57A5297F2cB2c0AaC9D554660acd6D385Ab50c6B",
  vXRP: "0xB248a295732e0225acd3337607cc01068e3b9c10",
  vBCH: "0x5F0388EBc2B94FA8E123F404b79cCF5f40b29176",
  vDOT: "0x1610bc33319e9398de5f57B33a5b184c806aD217",
  vLINK: "0x650b940a1033B8A1b1873f78730FcFC73ec11f1f",
  vDAI: "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1",
  vFIL: "0xf91d58b5aE142DAcC749f58A49FCBac340Cb0343",
  vBETH: "0x972207A639CC1B374B893cc33Fa251b55CEB7c07",
  vADA: "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec",
  vDOGE: "0xec3422Ef92B2fb59e84c8B02Ba73F1fE84Ed8D71",
  vMATIC: "0x5c9476FcD6a4F9a3654139721c949c2233bBbBc8",
  vCAKE: "0x86aC3974e2BD0d60825230fa6F355fF11409df5c",
  vAAVE: "0x26DA28954763B92139ED49283625ceCAf52C6f94",
  vTUSDOLD: "0x08CEB3F4a7ed3500cA0982bcd0FC7816688084c3",
  vTRXOLD: "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93",
  vTRX: "0xC5D3466aA484B040eE977073fcF337f2c00071c1",
  vWBETH: "0x6CFdEc747f37DAf3b87a35a1D9c8AD3063A1A8A0",
  vTUSD: "0xBf762cd5991cA1DCdDaC9ae5C638F5B5Dc3Bee6E",
  vUNI: "0x27FF564707786720C71A2e5c1490A63266683612",
  vFDUSD: "0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba",
  vTWT: "0x4d41a36D04D97785bcEA57b057C412b278e6Edcc",
  vSolvBTC: "0xf841cb62c19fCd4fF5CD0AaB5939f3140BaaC3Ea",
  vTHE: "0x86e06EAfa6A1eA631Eab51DE500E3D474933739f",
  vSOL: "0xBf515bA4D1b52FFdCeaBF20d31D705Ce789F2cEC",
  vlisUSD: "0x689E0daB47Ab16bcae87Ec18491692BF621Dc6Ab",
  "vPT-sUSDE-26JUN2025": "0x9e4E5fed5Ac5B9F732d0D850A615206330Bf1866",
  vsUSDe: "0x699658323d58eE25c69F1a29d476946ab011bD18",
  vUSDe: "0x74ca6930108F775CC667894EEa33843e691680d7",
  vUSD1: "0x0C1DA220D301155b87318B90692Da8dc43B67340",
  vxSolvBTC: "0xd804dE60aFD05EE6B89aab5D152258fD461B07D5",
  vasBNB: "0xCC1dB43a06d97f736C7B045AedD03C6707c09BDF",
  vBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
};

const blocknumber = 59654054;

const actions = {
  MINT: 0,
  REDEEM: 1,
  BORROW: 2,
  REPAY: 3,
  SEIZE: 4,
  LIQUIDATE: 5,
  TRANSFER: 6,
  ENTER_MARKET: 7,
  EXIT_MARKET: 8,
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;
  const comptrollerDeployment = await deployments.get("Unitroller");
  const comptroller = await ethers.getContractAt("ComptrollerMock", comptrollerDeployment.address);

  for (const [vTokenSymbol, vTokenAddress] of Object.entries(allVTokens)) {
    console.log(`\n--- ${vTokenSymbol} ---`);

    for (const [actionName, actionId] of Object.entries(actions)) {
      const isActionPaused = await comptroller.actionPaused(vTokenAddress, actionId, { blockTag: blocknumber });
      const logColor = isActionPaused ? "\x1b[31m" : "\x1b[32m"; // red for paused, green for unpaused
      console.log(`${logColor}Action: ${actionName}, ID: ${actionId}, Paused: ${isActionPaused}\x1b[0m`);
    }
  }
};

func.tags = ["LogActions"];
func.skip = async hre => hre.network.name !== "bscmainnet";

export default func;
