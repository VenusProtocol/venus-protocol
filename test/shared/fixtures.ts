import { BigNumber, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { Unitroller } from '../../typechain/Unitroller'
import { ComptrollerHarness } from '../../typechain/ComptrollerHarness'
import { SimplePriceOracle } from '../../typechain/SimplePriceOracle'
import { XVS } from '../../typechain/XVS'
import { VAIScenario } from '../../typechain/VAIScenario'
import { VAIUnitroller } from '../../typechain/VAIUnitroller'
import { VAIControllerHarness } from '../../typechain/VAIControllerHarness'
import { BEP20Harness } from '../../typechain/BEP20Harness'
import { InterestRateModelHarness } from '../../typechain/InterestRateModelHarness'
import { VBep20Harness } from '../../typechain/VBep20Harness'
import { Fixture, deployMockContract, MockContract } from 'ethereum-waffle'

export const bigNumber18 = BigNumber.from("1000000000000000000")  // 1e18
export const bigNumber17 = BigNumber.from("100000000000000000")  //1e17
export const bigNumber16 = BigNumber.from("10000000000000000")  //1e16
export const bigNumber15 = BigNumber.from("1000000000000000")  //1e15
export const bigNumber8 = BigNumber.from("100000000") // 1e8
export const dateNow = BigNumber.from("1636429275") // 2021-11-09 11:41:15

export async function getBlockNumber() {
    const blockNumber = await ethers.provider.getBlockNumber()
    // console.debug("Current block number: " + blockNumber);
    return blockNumber;
}

interface TestTokensFixture {
    usdt: BEP20Harness
}

async function testTokensFixture(): Promise<TestTokensFixture> {
    let testTokenFactory = await ethers.getContractFactory('BEP20Harness')
    let usdt = (await testTokenFactory.deploy(
        bigNumber18.mul(100000000),
        "usdt",
        BigNumber.from(18),
        "BEP20 usdt"
    )) as BEP20Harness
    return { usdt }
}

interface ComptrollerFixture extends TestTokensFixture {
    comptroller: ComptrollerHarness
    priceOracle: SimplePriceOracle
    xvs: XVS
    vai: VAIScenario
    vaiController: VAIControllerHarness
    vusdt: VBep20Harness
}

export const comptrollerFixture: Fixture<ComptrollerFixture> = async function ([wallet, treasuryGuardian, treasuryAddress]: Wallet[]): Promise<ComptrollerFixture> {
    // const unitrollerFactory =  await ethers.getContractFactory('Unitroller')
    // const unitroller = (await unitrollerFactory.deploy()) as Unitroller
    const { usdt } = await testTokensFixture();
    const comptrollerFactory = await ethers.getContractFactory('ComptrollerHarness');
    const comptroller = (await comptrollerFactory.deploy()) as ComptrollerHarness

    const priceOracleFactory = await ethers.getContractFactory('SimplePriceOracle')
    const priceOracle = (await priceOracleFactory.deploy()) as SimplePriceOracle

    const closeFactor = bigNumber17.mul(6)
    const liquidationIncentive = bigNumber18

    const xvsFactory = await ethers.getContractFactory('XVS')
    const xvs = (await xvsFactory.deploy(wallet.address)) as XVS

    const vaiFactory = await ethers.getContractFactory('VAIScenario')
    const vai = (await vaiFactory.deploy(BigNumber.from(97))) as VAIScenario

    const venusRate = bigNumber18
    const venusVAIRate = bigNumber17.mul(5)

    // await unitroller._setPendingImplementation(comptroller.address)
    // await comptroller._become(unitroller.address)

    // const vaiUnitrollerFactory = await ethers.getContractFactory('VAIUnitroller')
    // const vaiUnitroller = (await vaiUnitrollerFactory.deploy()) as VAIUnitroller

    const vaiControllerFactory = await ethers.getContractFactory('VAIControllerHarness');
    const vaiController = (await vaiControllerFactory.deploy()) as VAIControllerHarness

    // await vaiUnitroller._setPendingImplementation(vaiController.address)
    // await vaiController._become(vaiUnitroller.address)

    await comptroller._setVAIController(vaiController.address)
    // console.log('=========setVAIController==========')
    await vaiController._setComptroller(comptroller.address)
    // console.log('=========_setComptroller==========')
    await comptroller._setLiquidationIncentive(liquidationIncentive)
    // console.log('=========_setLiquidationIncentive==========')
    await comptroller._setCloseFactor(closeFactor)
    // console.log('=========_setCloseFactor==========')
    await comptroller._setPriceOracle(priceOracle.address)
    // console.log('=========_setPriceOracle==========')
    await comptroller.setXVSAddress(xvs.address)
    // console.log('=========setXVSAddress==========')
    await vaiController.setVAIAddress(vai.address)
    // console.log('=========setVAIAddress==========')
    await comptroller.harnessSetVenusRate(venusRate)
    // console.log('=========harnessSetVenusRate==========')
    await comptroller._setVenusVAIRate(venusVAIRate)
    // console.log('=========_setVenusVAIRate==========')
    await vaiController._initializeVenusVAIState(BigNumber.from(0))
    // console.log('=========_initializeVenusVAIState==========')
    // await vaiController.initialize()
    // console.log('=========initialize==========')
    await vai.rely(vaiController.address)
    // console.log('=========rely==========')
    await comptroller._setTreasuryData(treasuryGuardian.address, treasuryAddress.address, BigNumber.from("100000000000000"))
    // console.log('=========_setTreasuryData==========')
    await comptroller._setVAIMintRate(BigNumber.from(10000))
    await comptroller._setReceiver(treasuryAddress.address)
    await vaiController.initialize()

    const interestRateModelHarnessFactory = await ethers.getContractFactory('InterestRateModelHarness')
    const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(BigNumber.from(0))) as InterestRateModelHarness

    const vTokenFactory = await ethers.getContractFactory('VBep20Harness')
    const vusdt = (await vTokenFactory.deploy(
        usdt.address,
        comptroller.address,
        InterestRateModelHarness.address,
        bigNumber18,
        "VToken usdt",
        "vusdt",
        BigNumber.from(18),
        wallet.address
    )) as VBep20Harness
    await priceOracle.setUnderlyingPrice(vusdt.address, bigNumber18)
    await priceOracle.setDirectPrice(vai.address, bigNumber18)
    await comptroller._supportMarket(vusdt.address)

    return { usdt, comptroller, priceOracle, xvs, vai, vaiController, vusdt };
}