import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { Contracts } from "../../../networks/mainnet.json";
import {
  FaucetToken,
  FaucetToken__factory,
  PegStability,
  PegStability__factory,
  ResilientOracleInterface,
  ResilientOracleInterface__factory,
} from "../../../typechain";
import { VAI } from "../../../typechain/contracts/Tokens/VAI";
import { VAI__factory } from "../../../typechain/factories/contracts/Tokens/VAI";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

// ****************************
// ******* Constants **********
// ****************************
const acmAddress = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const venusTreasury = "0xf322942f644a996a617bd29c16bd7d231d9f35e9";
const resilientOracle = "0x6592b5DE802159F3E74B2486b091D11a8256ab8A";
const feeIn = BigNumber.from(100); // 10bps
const feeOut = BigNumber.from(0);
const BASIS_POINT_DIVISOR = BigNumber.from(10000);
const vaiMintCap = convertToUnit(1000, 18);
const USDT_HOLDER = "0x6a0b3611214d5001fa5efae91b7222a316c12b52";
const USDC_HOLDER = "0x97b9d2102a9a65a26e1ee82d59e42d1b73b68689";
const VAI_HOLDER = "0x29aa70f8f3f2aa241b0ba9eaa744c97808d032c9";
const MANTISSA_ONE = parseUnits("1", 18);

// ****************************
// ********* Config ***********
// ****************************
const psmConfigs = [
  {
    stableTokenName: "USDT",
    stableTokenAddress: Contracts.USDT,
    tokenHolder: USDT_HOLDER,
  },
  {
    stableTokenName: "USDC",
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

async function deployPegStability(stableToken: string): Promise<PegStability> {
  const psmFactory: PegStability__factory = await ethers.getContractFactory("PegStability");
  const psm: PegStability = await upgrades.deployProxy(
    psmFactory,
    [acmAddress, venusTreasury, resilientOracle, feeIn, feeOut, vaiMintCap],
    {
      constructorArgs: [stableToken, Contracts.VAI],
    },
  );
  await psm.deployed();
  return psm;
}

// *****************************
// * Flow Validation Functions *
// *****************************
async function validateInitialization(psm: PegStability, stableToken: string) {
  expect(await psm.VAI()).to.equal(Contracts.VAI);
  expect((await psm.STABLE_TOKEN_ADDRESS()).toLocaleLowerCase()).to.equal(stableToken.toLocaleLowerCase());
  expect((await psm.venusTreasury()).toLocaleLowerCase()).to.equal(venusTreasury);
  expect(await psm.oracle()).to.equal(resilientOracle);
  expect(await psm.feeIn()).to.equal(feeIn);
  expect(await psm.feeOut()).to.equal(feeOut);
  expect(await psm.vaiMintCap()).to.equal(vaiMintCap);
  expect(await psm.vaiMinted()).to.equal(0);
  expect(await psm.isPaused()).to.be.false;
  expect(await psm.accessControlManager()).to.equal(acmAddress);
}
async function swapStableForVAIAndValidate(
  psm: PegStability,
  stableToken: FaucetToken,
  stableTokenPrice: BigNumber,
  tokenSigner: SignerWithAddress,
  tokenHolder: string,
  VAI: VAI,
) {
  const stableTokenAmount = BigNumber.from(convertToUnit(1000, 18));
  // calculate price of stableToken in USD, applying MIN(1$, oracle_price) thus capping stableToken maximum price to 1$
  const feeInTokenPrice = stableTokenPrice.gt(MANTISSA_ONE) ? MANTISSA_ONE : stableTokenPrice;
  const stableTokenAmountUSD = stableTokenAmount.mul(feeInTokenPrice).div(MANTISSA_ONE);
  const fee = stableTokenAmountUSD.mul(feeIn).div(BASIS_POINT_DIVISOR);
  const vaiToMint = stableTokenAmountUSD.sub(fee);
  await stableToken.connect(tokenSigner).approve(psm.address, stableTokenAmount);
  const vaiBalanceBefore = await VAI.balanceOf(tokenHolder);
  const tx = await psm.connect(tokenSigner).swapStableForVAI(tokenHolder, stableTokenAmount);
  const vaiBalanceAfter = await VAI.balanceOf(tokenHolder);
  const vaiBalance = vaiBalanceAfter.sub(vaiBalanceBefore);
  expect(vaiBalance).to.equal(vaiToMint);
  await expect(tx).to.emit(psm, "StableForVAISwapped").withArgs(stableTokenAmount, vaiToMint, fee);
}

async function swapVAIForStableAndValidate(
  psm: PegStability,
  stableTokenName: string,
  stableTokenPrice: BigNumber,
  VAI: VAI,
  vaiSigner: SignerWithAddress,
) {
  const tokenAmount = BigNumber.from(convertToUnit(100, 18));
  // calculate price of stableToken in USD, applying MAX(1$, oracle_price) thus making stableToken minimum price to 1$
  const feeOutTokenPrice = stableTokenPrice.gt(MANTISSA_ONE) ? stableTokenPrice : MANTISSA_ONE;
  const tokenAmountUsd: BigNumber = tokenAmount.mul(feeOutTokenPrice).div(MANTISSA_ONE);
  formatConsoleLog(`${stableTokenName} Price: ` + stableTokenPrice.toString());
  await VAI.connect(vaiSigner).approve(psm.address, tokenAmountUsd);
  const tx = await psm.connect(vaiSigner).swapVAIForStable(VAI_HOLDER, convertToUnit(100, 18));
  await expect(tx).to.emit(psm, "VAIForStableSwapped").withArgs(tokenAmountUsd, tokenAmount, 0);
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
  const blockNumber = 30245711;
  forking(blockNumber, () => {
    for (const { stableTokenName, stableTokenAddress, tokenHolder } of psmConfigs) {
      let defaultSigner: SignerWithAddress;
      let tokenSigner: SignerWithAddress;
      let vaiSigner: SignerWithAddress;
      let vaiAdmin: SignerWithAddress;
      let psm: PegStability;
      let oracle: ResilientOracleInterface;
      let stableTokenPrice: BigNumber;
      let stableToken: FaucetToken;
      let VAI: VAI;
      describe(`Peg Stability ${stableTokenName}`, () => {
        before(async () => {
          defaultSigner = (await ethers.getSigners())[0];
          psm = await deployPegStability(stableTokenAddress);
          tokenSigner = await initMainnetUser(tokenHolder);
          vaiSigner = await initMainnetUser(VAI_HOLDER);
          stableToken = FaucetToken__factory.connect(stableTokenAddress, tokenSigner);
          vaiAdmin = await initMainnetUser(Contracts.Timelock);
          VAI = VAI__factory.connect(Contracts.VAI, vaiAdmin);
          oracle = ResilientOracleInterface__factory.connect(resilientOracle, defaultSigner);
          stableTokenPrice = await oracle.getPrice(stableTokenAddress);
          console.log(`Stable Token Price`);
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
            return validateInitialization(psm, stableTokenAddress);
          });
          it("Should not be able to re-initialize", async () => {
            return validateReInitialization(psm);
          });
        });
        describe("Swap", () => {
          it(`${stableTokenName} -> VAI`, async () => {
            return swapStableForVAIAndValidate(psm, stableToken, stableTokenPrice, tokenSigner, tokenHolder, VAI);
          });
          it(`VAI -> ${stableTokenName}`, async () => {
            return swapVAIForStableAndValidate(psm, stableTokenName, stableTokenPrice, VAI, vaiSigner);
          });
        });
      });
    }
  });
}
