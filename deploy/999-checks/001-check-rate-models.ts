import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { assertBlockBasedChain, blocksPerYear as chainBlocksPerYear } from "../../helpers/chains";
import { markets } from "../../helpers/markets";
import {
  JumpRateModelParams,
  Parsed,
  RateModelParams,
  TwoKinksRateModelParams,
  WpRateModelParams,
} from "../../helpers/markets/types";
import { getRateModelName } from "../../helpers/rateModelHelpers";

const expectEqual = (msg: string, a: BigNumber, b: BigNumber) => {
  if (!a.eq(b)) {
    throw new Error(`Expected ${a.toString()} == ${b.toString()}\n${msg}`);
  }
};

const checkBlocksPerYear = async (rateModel: Contract, name: string, expected: number) => {
  try {
    expectEqual(
      `Checking blocksPerYear for ${name} at ${rateModel.address}`,
      await rateModel.blocksPerYear(),
      BigNumber.from(expected),
    );
  } catch (err) {
    console.warn(`Could not get blocks per year for rate model at ${rateModel.address}, assuming ${expected}`);
  }
};

const checkWpRateModel = async (rateModelAddress: string, params: Parsed<WpRateModelParams>, blocksPerYear: number) => {
  const name = getRateModelName(params, blocksPerYear);
  const rateModel = await ethers.getContractAt("WhitePaperInterestRateModel", rateModelAddress);
  await checkBlocksPerYear(rateModel, name, blocksPerYear);
  expectEqual(
    `Checking baseRatePerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.baseRatePerBlock(),
    params.baseRatePerYear.div(blocksPerYear),
  );
  expectEqual(
    `Checking multiplierPerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.multiplierPerBlock(),
    params.multiplierPerYear.div(blocksPerYear),
  );
};

const checkJumpRateModel = async (
  rateModelAddress: string,
  params: Parsed<JumpRateModelParams>,
  blocksPerYear: number,
) => {
  const name = getRateModelName(params, blocksPerYear);
  const rateModel = await ethers.getContractAt("JumpRateModel", rateModelAddress);
  await checkBlocksPerYear(rateModel, name, blocksPerYear);
  expectEqual(
    `Checking baseRatePerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.baseRatePerBlock(),
    params.baseRatePerYear.div(blocksPerYear),
  );
  expectEqual(
    `Checking multiplierPerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.multiplierPerBlock(),
    params.multiplierPerYear.div(blocksPerYear),
  );
  expectEqual(
    `Checking jumpMultiplierPerBlock for ${name} at ${rateModelAddress}`,
    await rateModel.jumpMultiplierPerBlock(),
    params.jumpMultiplierPerYear.div(blocksPerYear),
  );
  expectEqual(`Checking kink for ${name} at ${rateModelAddress}`, await rateModel.kink(), params.kink);
};

const checkTwoKinksRateModel = async (
  rateModelAddress: string,
  params: Parsed<TwoKinksRateModelParams>,
  blocksPerYear: number,
) => {
  const name = getRateModelName(params, blocksPerYear);
  const rateModel = await ethers.getContractAt("TwoKinksInterestRateModel", rateModelAddress);
  try {
    expectEqual(
      `Checking blocksPerYear for ${name} at ${rateModel.address}`,
      await rateModel.BLOCKS_PER_YEAR(),
      BigNumber.from(blocksPerYear),
    );
  } catch (err) {
    console.warn(`Could not get blocks per year for rate model at ${rateModel.address}, assuming ${blocksPerYear}`);
  }
  expectEqual(
    `Checking BASE_RATE_PER_BLOCK for ${name} at ${rateModelAddress}`,
    await rateModel.BASE_RATE_PER_BLOCK(),
    params.baseRatePerYear.div(blocksPerYear),
  );
  expectEqual(
    `Checking MULTIPLIER_PER_BLOCK for ${name} at ${rateModelAddress}`,
    await rateModel.MULTIPLIER_PER_BLOCK(),
    params.multiplierPerYear.div(blocksPerYear),
  );
  expectEqual(`${name}.KINK_1`, await rateModel.KINK_1(), params.kink);
  expectEqual(
    `Checking BASE_RATE_2_PER_BLOCK for ${name} at ${rateModelAddress}`,
    await rateModel.BASE_RATE_2_PER_BLOCK(),
    params.baseRatePerYear2.div(blocksPerYear),
  );
  expectEqual(
    `Checking MULTIPLIER_2_PER_BLOCK for ${name} at ${rateModelAddress}`,
    await rateModel.MULTIPLIER_2_PER_BLOCK(),
    params.multiplierPerYear2.div(blocksPerYear),
  );
  expectEqual(`${name}.KINK_2`, await rateModel.KINK_2(), params.kink2);
  expectEqual(
    `Checking JUMP_MULTIPLIER_PER_BLOCK for ${name} at ${rateModelAddress}`,
    await rateModel.JUMP_MULTIPLIER_PER_BLOCK(),
    params.jumpMultiplierPerYear.div(blocksPerYear),
  );
};

const checkRateModel = (
  rateModelAddress: string,
  params: Parsed<RateModelParams>,
  blocksPerYear: number,
): Promise<void> => {
  switch (params.model) {
    case "whitepaper":
      return checkWpRateModel(rateModelAddress, params, blocksPerYear);
    case "jump":
      return checkJumpRateModel(rateModelAddress, params, blocksPerYear);
    case "two-kinks":
      return checkTwoKinksRateModel(rateModelAddress, params, blocksPerYear);
  }
};

const test = async <T>(message: string, check: () => T | Promise<T>) => {
  try {
    await check();
    console.log(`✅ ${message}`);
  } catch (err) {
    console.log(`❌ Failure: ${message}`);
    console.error(err);
  }
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const chain = assertBlockBasedChain(hre.network.name);
  const marketsConfig = markets[chain];
  const blocksPerYear = chainBlocksPerYear[chain];

  for (const vTokenConfig of marketsConfig) {
    const { symbol, interestRateModel } = vTokenConfig;
    console.log(`Checking interest rate model of ${symbol}`);
    const vTokenAddress = (await deployments.get(`${symbol}`)).address;
    const vToken = await ethers.getContractAt("VToken", vTokenAddress);
    const rateModelAddress = await vToken.interestRateModel();
    const name = getRateModelName(interestRateModel, blocksPerYear);
    await test(`Rate model at ${rateModelAddress} should be ${name}`, () =>
      checkRateModel(rateModelAddress, interestRateModel, blocksPerYear));
    const deployment = await deployments.getOrNull(name);
    await test(`Deployment for ${name} exists`, () => {
      if (!deployment) throw new Error(`Deployment for ${name} not found`);
    });
    if (!deployment) {
      continue;
    }
    if (deployment.address === rateModelAddress) {
      console.log(`✅ Deployment address matches the rate model address`);
    } else {
      console.warn(`⚠️ Deployment at ${deployment.address} does not match ${rateModelAddress}`);
      await test(`Rate model at ${deployment.address} should still be ${name}`, () =>
        checkRateModel(deployment.address, interestRateModel, blocksPerYear));
    }
    console.log(`-----------------------------------------`);
  }
};

func.tags = ["CheckIRMs"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;
