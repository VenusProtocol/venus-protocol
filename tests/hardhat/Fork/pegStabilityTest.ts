import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { convertToBigInt, convertToUnit } from "../../../helpers/utils";
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

const acmAddress = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const venusTreasury = "0xf322942f644a996a617bd29c16bd7d231d9f35e9";
const feeIn = BigNumber.from(100); // 10bps
const feeOut = BigNumber.from(0);
const BASIS_POINT_DIVISOR = BigNumber.from(10000);
const vaiMintCap = convertToUnit(1000, 18);
const USDT_HOLDER = "0x6a0b3611214d5001fa5efae91b7222a316c12b52";
const USDC_HOLDER = "0x97b9d2102a9a65a26e1ee82d59e42d1b73b68689";
const VAI_HOLDER = "0x29aa70f8f3f2aa241b0ba9eaa744c97808d032c9";

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

async function validateInitialization(psm: PegStability, vTokenStable: string, stableToken: string) {
  expect(await psm.vaiAddress()).to.equal(Contracts.VAI);
  expect(await psm.comptroller()).to.equal(Contracts.Unitroller);
  expect((await psm.vTokenAddress()).toLocaleLowerCase()).to.equal(vTokenStable.toLocaleLowerCase());
  expect((await psm.stableTokenAddress()).toLocaleLowerCase()).to.equal(stableToken.toLocaleLowerCase());
  expect((await psm.venusTreasury()).toLocaleLowerCase()).to.equal(venusTreasury);
  expect(await psm.feeIn()).to.equal(feeIn);
  expect(await psm.feeOut()).to.equal(feeOut);
  expect(await psm.vaiMintCap()).to.equal(vaiMintCap);
  expect(await psm.vaiMinted()).to.equal(0);
  expect(await psm.isPaused()).to.be.false;
  expect(await psm.accessControlManager()).to.equal(acmAddress);
}

async function validateReInitialization(psm: PegStability) {
  await expect(
    psm.initialize(acmAddress, venusTreasury, Contracts.Unitroller, feeIn, feeOut, vaiMintCap),
  ).to.be.rejectedWith("Initializable: contract is already initialized");
}

if (FORK_MAINNET) {
  const blockNumber = 28052615;
  forking(blockNumber, () => {
    let psmUSDT: PegStability;
    let psmUSDC: PegStability;
    let defaultSigner: SignerWithAddress;
    let usdtSigner: SignerWithAddress;
    let usdcSigner: SignerWithAddress;
    let vaiSigner: SignerWithAddress;
    let vaiAdmin: SignerWithAddress;
    let VAI: VAI;
    let USDT: FaucetToken;
    let USDC: FaucetToken;
    let oracle: PriceOracle;
    let price: BigNumber;

    describe("Peg Stability USDT", () => {
      before(async () => {
        defaultSigner = (await ethers.getSigners())[0];
        psmUSDT = await deployPegStability(Contracts.vUSDT);
        usdtSigner = await initMainnetUser(USDT_HOLDER);
        vaiSigner = await initMainnetUser(VAI_HOLDER);
        USDT = FaucetToken__factory.connect(Contracts.USDT, usdtSigner);
        vaiAdmin = await initMainnetUser(Contracts.Timelock);
        VAI = VAI__factory.connect(Contracts.VAI, vaiAdmin);
        //Get oracle address
        const comptroller = Comptroller__factory.connect(Contracts.Unitroller, defaultSigner);
        const oracleAddress = await comptroller.oracle();
        oracle = PriceOracle__factory.connect(oracleAddress, defaultSigner);
        price = await oracle.getUnderlyingPrice(Contracts.vUSDT);
        // Fund Timelock
        await usdtSigner.sendTransaction({
          to: await vaiAdmin.getAddress(),
          value: convertToUnit(1, 18),
        });
        //Set PSM as VAI ward
        await VAI.rely(psmUSDT.address);
      });
      describe("Initialization", () => {
        it("Validate initialization parameters", () => {
          return validateInitialization(psmUSDT, Contracts.vUSDT, Contracts.USDT);
        });
        it("Should not be able to re-initialize", async () => {
          return validateReInitialization(psmUSDT);
        });
      });
      describe("Swap", () => {
        it("USDT -> VAI", async () => {
          const token_amount = BigNumber.from(convertToUnit(1000, 18));
          const fee = token_amount.mul(feeIn).div(BASIS_POINT_DIVISOR);
          const vai_to_mint = token_amount.sub(fee);
          const signerAddress = usdtSigner.getAddress();
          await USDT.connect(usdtSigner).approve(psmUSDT.address, token_amount);
          const vaiBalanceBefore = await VAI.balanceOf(signerAddress);
          const tx = await psmUSDT.connect(usdtSigner).swapStableForVAI(USDT_HOLDER, convertToUnit(1000, 18));
          const vaiBalanceAfter = await VAI.balanceOf(signerAddress);
          const vaiBalance = vaiBalanceAfter.sub(vaiBalanceBefore);
          expect(vaiBalance).to.equal(vai_to_mint);
          await expect(tx).to.emit(psmUSDT, "StableForVAISwapped").withArgs(token_amount, vai_to_mint, fee);
        });
        it("VAI -> USDT", async () => {
          const mantissa_one = BigNumber.from(convertToUnit(1, 18));
          const token_amount = BigNumber.from(convertToUnit(100, 18));
          const token_amount_usd: BigNumber = token_amount.mul(price).div(mantissa_one);
          console.log("USDT Price: " + price.toString());
          await VAI.connect(vaiSigner).approve(psmUSDT.address, token_amount_usd);
          const tx = await psmUSDT.connect(vaiSigner).swapVAIForStable(VAI_HOLDER, convertToUnit(100, 18));
          await expect(tx).to.emit(psmUSDT, "VaiForStableSwapped").withArgs(token_amount_usd, 0, token_amount);
        });
      });
    });
    describe("Peg Stability USDC", () => {
      before(async () => {
        defaultSigner = (await ethers.getSigners())[0];
        psmUSDC = await deployPegStability(Contracts.vUSDC);
        usdcSigner = await initMainnetUser(USDC_HOLDER);
        vaiSigner = await initMainnetUser(VAI_HOLDER);
        USDC = FaucetToken__factory.connect(Contracts.USDC, usdcSigner);
        vaiAdmin = await initMainnetUser(Contracts.Timelock);
        VAI = VAI__factory.connect(Contracts.VAI, vaiAdmin);
        //Get oracle address
        const comptroller = Comptroller__factory.connect(Contracts.Unitroller, defaultSigner);
        const oracleAddress = await comptroller.oracle();
        oracle = PriceOracle__factory.connect(oracleAddress, defaultSigner);
        price = await oracle.getUnderlyingPrice(Contracts.vUSDC);
        await VAI.rely(psmUSDC.address);
      });
      describe("Initialization", () => {
        it("Validate initialization parameters", () => {
          return validateInitialization(psmUSDC, Contracts.vUSDC, Contracts.USDC);
        });
        it("Should not be able to re-initialize", async () => {
          return validateReInitialization(psmUSDC);
        });
      });
      describe("Swap", () => {
        it("USDC -> VAI", async () => {
          const token_amount = BigNumber.from(convertToUnit(1000, 18));
          const fee = token_amount.mul(feeIn).div(BASIS_POINT_DIVISOR);
          const vai_to_mint = token_amount.sub(fee);
          await USDC.connect(usdcSigner).approve(psmUSDC.address, token_amount);
          const tx = await psmUSDC.connect(usdcSigner).swapStableForVAI(USDC_HOLDER, convertToUnit(1000, 18));
          await expect(tx).to.emit(psmUSDC, "StableForVAISwapped").withArgs(token_amount, vai_to_mint, fee);
        });
        it("VAI -> USDC", async () => {
          const mantissa_one = BigNumber.from(convertToUnit(1, 18));
          const token_amount = BigNumber.from(convertToUnit(100, 18));
          const token_amount_usd: BigNumber = token_amount.mul(price).div(mantissa_one);
          console.log("USDT Price: " + price.toString());
          await VAI.connect(vaiSigner).approve(psmUSDC.address, token_amount_usd);
          const tx = await psmUSDC.connect(vaiSigner).swapVAIForStable(VAI_HOLDER, convertToUnit(100, 18));
          await expect(tx).to.emit(psmUSDC, "VaiForStableSwapped").withArgs(token_amount_usd, 0, token_amount);
        });
      });
    });
  });
}
