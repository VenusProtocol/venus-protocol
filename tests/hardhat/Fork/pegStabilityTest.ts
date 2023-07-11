import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { Contracts } from "../../../networks/mainnet.json";
import {
  Comptroller__factory,
  FaucetToken,
  FaucetToken__factory,
  PegStability,
  PegStability__factory,
  PriceOracle,
  PriceOracle__factory,
} from "../../../typechain";
import { VAI } from "../../../typechain/contracts/Tokens/VAI";
import { VAI__factory } from "../../../typechain/factories/contracts/Tokens/VAI";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

// ****************************
// ******* Constants **********
// ****************************
const acmAddress = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const venusTreasury = "0xf322942f644a996a617bd29c16bd7d231d9f35e9";
const feeIn = BigNumber.from(100); // 10bps
const feeOut = BigNumber.from(0);
const BASIS_POINT_DIVISOR = BigNumber.from(10000);
const vaiMintCap = convertToUnit(1000, 18);
const USDT_HOLDER = "0x6a0b3611214d5001fa5efae91b7222a316c12b52";
const USDC_HOLDER = "0x97b9d2102a9a65a26e1ee82d59e42d1b73b68689";
const VAI_HOLDER = "0x29aa70f8f3f2aa241b0ba9eaa744c97808d032c9";

// ****************************
// ********* Config ***********
// ****************************
const psmConfigs = [
  {
    stableTokenName: "USDT",
    vTokenStable: Contracts.vUSDT,
    stableTokenAddress: Contracts.USDT,
    tokenHolder: USDT_HOLDER,
  },
  {
    stableTokenName: "USDC",
    vTokenStable: Contracts.vUSDC,
    stableTokenAddress: Contracts.USDC,
    tokenHolder: USDC_HOLDER,
  },
];

// ****************************
// ***** Helper Functions *****
// ****************************
function formatConsoleLog(message: string) {
  const indentation = " ".repeat(10); // Adjust the number of spaces for indentation
  // Format the message using ANSI escape codes
  const formattedMessage = `\x1b[90m${message}\x1b[0m`; // Set gray color (90) and reset color (0)
  console.log(`${indentation}${formattedMessage}`);
}

async function deployPegStability(vTokenStable: string): Promise<PegStability> {
  const psmFactory: PegStability__factory = await ethers.getContractFactory("PegStability");
  const psm: PegStability = await upgrades.deployProxy(
    psmFactory,
    [acmAddress, venusTreasury, Contracts.Unitroller, feeIn, feeOut, vaiMintCap],
    {
      constructorArgs: [vTokenStable, Contracts.VAI],
    },
  );
  await psm.deployed();
  return psm;
}

// *****************************
// * Flow Validation Functions *
// *****************************
async function validateInitialization(psm: PegStability, vTokenStable: string, stableToken: string) {
  expect(await psm.VAI_ADDRESS()).to.equal(Contracts.VAI);
  expect(await psm.comptroller()).to.equal(Contracts.Unitroller);
  expect((await psm.VTOKEN_ADDRESS()).toLocaleLowerCase()).to.equal(vTokenStable.toLocaleLowerCase());
  expect((await psm.STABLE_TOKEN_ADDRESS()).toLocaleLowerCase()).to.equal(stableToken.toLocaleLowerCase());
  expect((await psm.venusTreasury()).toLocaleLowerCase()).to.equal(venusTreasury);
  expect(await psm.feeIn()).to.equal(feeIn);
  expect(await psm.feeOut()).to.equal(feeOut);
  expect(await psm.vaiMintCap()).to.equal(vaiMintCap);
  expect(await psm.vaiMinted()).to.equal(0);
  expect(await psm.isPaused()).to.be.false;
  expect(await psm.accessControlManager()).to.equal(acmAddress);
}
async function swapStableForVaiAndValidate(
  psm: PegStability,
  stableToken: FaucetToken,
  tokenSigner: SignerWithAddress,
  tokenHolder: string,
  VAI: VAI,
) {
  const stableTokenAmount = BigNumber.from(convertToUnit(1000, 18));
  const fee = stableTokenAmount.mul(feeIn).div(BASIS_POINT_DIVISOR);
  const vaiToMint = stableTokenAmount.sub(fee);
  await stableToken.connect(tokenSigner).approve(psm.address, stableTokenAmount);
  const vaiBalanceBefore = await VAI.balanceOf(tokenHolder);
  const tx = await psm.connect(tokenSigner).swapStableForVAI(tokenHolder, convertToUnit(1000, 18));
  const vaiBalanceAfter = await VAI.balanceOf(tokenHolder);
  const vaiBalance = vaiBalanceAfter.sub(vaiBalanceBefore);
  expect(vaiBalance).to.equal(vaiToMint);
  await expect(tx).to.emit(psm, "StableForVAISwapped").withArgs(stableTokenAmount, vaiToMint, fee);
}

async function swapVaiForStableAndValidate(
  psm: PegStability,
  stableTokenName: string,
  stableTokenPrice: BigNumber,
  VAI: VAI,
  vaiSigner: SignerWithAddress,
) {
  const mantissa_one = BigNumber.from(convertToUnit(1, 18));
  const token_amount = BigNumber.from(convertToUnit(100, 18));
  const token_amount_usd: BigNumber = token_amount.mul(stableTokenPrice).div(mantissa_one);
  formatConsoleLog(`${stableTokenName} Price: ` + stableTokenPrice.toString());
  await VAI.connect(vaiSigner).approve(psm.address, token_amount_usd);
  const tx = await psm.connect(vaiSigner).swapVAIForStable(VAI_HOLDER, convertToUnit(100, 18));
  await expect(tx).to.emit(psm, "VaiForStableSwapped").withArgs(token_amount_usd, 0, token_amount);
}

async function validateReInitialization(psm: PegStability) {
  await expect(
    psm.initialize(acmAddress, venusTreasury, Contracts.Unitroller, feeIn, feeOut, vaiMintCap),
  ).to.be.rejectedWith("Initializable: contract is already initialized");
}

// ****************************
// ******* TEST SUITE *********
// ****************************

if (FORK_MAINNET) {
  const blockNumber = 28052615;
  forking(blockNumber, () => {
    for (const { stableTokenName, vTokenStable, stableTokenAddress, tokenHolder } of psmConfigs) {
      let defaultSigner: SignerWithAddress;
      let tokenSigner: SignerWithAddress;
      let vaiSigner: SignerWithAddress;
      let vaiAdmin: SignerWithAddress;
      let psm: PegStability;
      let oracle: PriceOracle;
      let stableTokenPrice: BigNumber;
      let stableToken: FaucetToken;
      let VAI: VAI;
      describe(`Peg Stability ${stableTokenName}`, () => {
        before(async () => {
          defaultSigner = (await ethers.getSigners())[0];
          psm = await deployPegStability(vTokenStable);
          tokenSigner = await initMainnetUser(tokenHolder);
          vaiSigner = await initMainnetUser(VAI_HOLDER);
          stableToken = FaucetToken__factory.connect(stableTokenAddress, tokenSigner);
          vaiAdmin = await initMainnetUser(Contracts.Timelock);
          VAI = VAI__factory.connect(Contracts.VAI, vaiAdmin);
          //Get oracle address
          const comptroller = Comptroller__factory.connect(Contracts.Unitroller, defaultSigner);
          const oracleAddress = await comptroller.oracle();
          oracle = PriceOracle__factory.connect(oracleAddress, defaultSigner);
          stableTokenPrice = await oracle.getUnderlyingPrice(vTokenStable);
          // Fund Timelock
          await tokenSigner.sendTransaction({
            to: await vaiAdmin.getAddress(),
            value: convertToUnit(1, 18),
          });
          //Set PSM as VAI ward
          await VAI.rely(psm.address);
        });
        describe("Initialization", () => {
          it("Validate initialization parameters", () => {
            return validateInitialization(psm, vTokenStable, stableTokenAddress);
          });
          it("Should not be able to re-initialize", async () => {
            return validateReInitialization(psm);
          });
        });
        describe("Swap", () => {
          it(`${stableTokenName} -> VAI`, async () => {
            return swapStableForVaiAndValidate(psm, stableToken, tokenSigner, tokenHolder, VAI);
          });
          it(`VAI -> ${stableTokenName}`, async () => {
            return swapVaiForStableAndValidate(psm, stableTokenName, stableTokenPrice, VAI, vaiSigner);
          });
        });
      });
    }
  });
}
