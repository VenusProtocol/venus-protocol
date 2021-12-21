import { Wallet, BigNumber } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { ComptrollerHarness } from '../typechain/ComptrollerHarness'
import { SimplePriceOracle } from '../typechain/SimplePriceOracle'
import { XVS } from '../typechain/XVS'
import { VAIScenario } from '../typechain/VAIScenario'
import { VAIControllerHarness } from '../typechain/VAIControllerHarness'
import { BEP20Harness } from '../typechain/BEP20Harness'
import { VBep20Harness } from '../typechain/VBep20Harness'
import { expect } from './shared/expect'
import { comptrollerFixture, bigNumber18, bigNumber17, bigNumber16 } from './shared/fixtures'

const createFixtureLoader = waffle.createFixtureLoader

describe('Comptroller', async () => {
    let wallet: Wallet,
        user1: Wallet,
        user2: Wallet,
        treasuryGuardian: Wallet,
        treasuryAddress: Wallet;

    let comptroller: ComptrollerHarness
    let priceOracle: SimplePriceOracle
    let xvs: XVS
    let vai: VAIScenario
    let vaiController: VAIControllerHarness
    let usdt: BEP20Harness
    let vusdt: VBep20Harness

    let loadFixTure: ReturnType<typeof createFixtureLoader>;

    before('create fixture loader', async () => {
        [wallet, user1, user2, treasuryGuardian, treasuryAddress] = await (ethers as any).getSigners()
        loadFixTure = createFixtureLoader([wallet, treasuryGuardian, treasuryAddress])
    })

    beforeEach('deploy Comptroller', async () => {
        ; ({ usdt, comptroller, priceOracle, xvs, vai, vaiController, vusdt } = await loadFixTure(comptrollerFixture));
        await vusdt.harnessSetBalance(user1.address, bigNumber18.mul(100))
        await comptroller.connect(user1).enterMarkets([vusdt.address])
    })

    it('check wallet usdt balance', async () => {
        expect(await usdt.balanceOf(wallet.address)).to.eq(bigNumber18.mul(100000000))
        expect(await vusdt.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
    })

    describe('#getMintableVAI', async () => {
        it('oracle', async () => {
            expect(await comptroller.oracle()).to.eq(priceOracle.address)
        })

        it('getAssetsIn', async () => {
            let enteredMarkets = await comptroller.getAssetsIn(user1.address)
            expect(enteredMarkets.length).to.eq(1)
        })

        it('getAccountSnapshot', async () => {
            let res = await vusdt.getAccountSnapshot(user1.address)
            expect(res[0]).to.eq(0)
            expect(res[1]).to.eq(bigNumber18.mul(100))
            expect(res[2]).to.eq(BigNumber.from(0))
            expect(res[3]).to.eq(bigNumber18)
        })

        it('getUnderlyingPrice', async () => {
            expect(await priceOracle.getUnderlyingPrice(vusdt.address)).to.eq(bigNumber18)
        })

        it('getComtroller', async () => {
            expect(await vaiController.admin()).to.eq(wallet.address)
            expect(await vaiController.comptroller()).to.eq(comptroller.address)
        })

        it('success', async () => {
            let res = await vaiController.getMintableVAI(user1.address)
            expect(res[1]).to.eq(bigNumber18.mul(100))
        })
    })

    describe('#mintVAI', async () => {
        it('success', async () => {
            await vaiController.connect(user1).mintVAI(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(100))
        })
    })

    describe('#repayVAI', async () => {
        beforeEach('mintVAI', async () => {
            await vaiController.connect(user1).mintVAI(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
            await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256)
        })

        it('success for zero rate', async () => {
            await vaiController.connect(user1).repayVAI(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(BigNumber.from(0))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(BigNumber.from(0))
        })

        it('success for 1.2 rate repay all', async () => {
            await vai.allocateTo(user1.address, bigNumber18.mul(20))
            await comptroller._setBaseRate(bigNumber17.mul(2))
            await vaiController.connect(user1).repayVAI(bigNumber18.mul(120))
            expect(await vai.balanceOf(user1.address)).to.eq(BigNumber.from(0))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(BigNumber.from(0))
            expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(20))
        })

        it('success for 1.2 rate repay half', async () => {
            await comptroller._setBaseRate(bigNumber17.mul(2))
            await vaiController.connect(user1).repayVAI(bigNumber18.mul(60))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(40))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(50))
            expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(10))
        })
    })

    describe('#getHypotheticalAccountLiquidity', async () => {
        beforeEach('user1 borrow', async () => {
            await vaiController.connect(user1).mintVAI(bigNumber18.mul(100))
            await vai.allocateTo(user2.address, bigNumber18.mul(100))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
        })

        it('success for zero rate 0.9 vusdt collateralFactor', async () => {
            await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9))
            let res = await comptroller.getHypotheticalAccountLiquidity(user1.address, ethers.constants.AddressZero, BigNumber.from(0), BigNumber.from(0));
            expect(res[1]).to.eq(0)
            expect(res[2]).to.eq(bigNumber18.mul(10))
        })

        it('success for 1.2 rate 0.9 vusdt collateralFactor', async () => {
            await comptroller._setBaseRate(bigNumber17.mul(2))
            await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9))
            let res = await comptroller.getHypotheticalAccountLiquidity(user1.address, ethers.constants.AddressZero, BigNumber.from(0), BigNumber.from(0));
            expect(res[1]).to.eq(0)
            expect(res[2]).to.eq(bigNumber18.mul(30))
        })
    })

    describe('#liquidateVAI', async () => {
        beforeEach('user1 borrow', async () => {
            await vaiController.connect(user1).mintVAI(bigNumber18.mul(100))
            await vai.allocateTo(user2.address, bigNumber18.mul(100))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
            expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(100))
        })

        it('liquidationIncentiveMantissa', async () => {
            expect(await comptroller.liquidationIncentiveMantissa()).to.eq(bigNumber18)
        })

        it('success for zero rate 0.9 vusdt collateralFactor', async () => {
            await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256)
            await vaiController.harnessSetBlockNumber(BigNumber.from(100000))
            await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9))
            await vaiController.connect(user2).liquidateVAI(user1.address, bigNumber18.mul(60), vusdt.address)
            expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(40))
            expect(await vusdt.balanceOf(user2.address)).to.eq(bigNumber18.mul(60))
        })

        it('success for 1.2 rate 0.9 vusdt collateralFactor', async () => {
            await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256)
            await vaiController.harnessSetBlockNumber(BigNumber.from(100000))
            await comptroller._setBaseRate(bigNumber17.mul(2))
            await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9))
            await vaiController.connect(user2).liquidateVAI(user1.address, bigNumber18.mul(72), vusdt.address)
            expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(28))
            expect(await vusdt.balanceOf(user2.address)).to.eq(bigNumber18.mul(60))
            expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(12))
            expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(40))
        })
    })

    describe('#getVAIRepayRate', async () => {
        it('success for zero baseRate', async () => {
            let res = await comptroller.getVAIRepayRate()
            expect(res).to.eq(bigNumber18)
        })

        it('success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18', async () => {
            await comptroller._setBaseRate(bigNumber17)
            await comptroller._setFloatRate(bigNumber17)
            expect(await comptroller.getVAIRepayRate()).to.eq(bigNumber17.mul(11))
        })

        it('success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18', async () => {
            await comptroller._setBaseRate(bigNumber17)
            await comptroller._setFloatRate(bigNumber17)
            await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5))
            expect(await comptroller.getVAIRepayRate()).to.eq(bigNumber16.mul(115))
        })
    })

    describe('#getVAIRepayAmount', async () => {
        beforeEach('mintVAI', async () => {
            await vaiController.connect(user1).mintVAI(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
            await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256)
        })

        it('success for zero rate', async () => {
            expect(await comptroller.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(100))
        })

        it('success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18', async () => {
            await comptroller._setBaseRate(bigNumber17)
            await comptroller._setFloatRate(bigNumber17)
            expect(await comptroller.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(110))
        })

        it('success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18', async () => {
            await comptroller._setBaseRate(bigNumber17)
            await comptroller._setFloatRate(bigNumber17)
            await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5))
            expect(await comptroller.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(115))
        })
    })

    describe('#getVAICalculateRepayAmount', async () => {
        beforeEach('mintVAI', async () => {
            await vaiController.connect(user1).mintVAI(bigNumber18.mul(100))
            expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100))
            await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256)
        })

        it('success for zero rate', async () => {
            expect(await comptroller.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(50))).to.eq(bigNumber18.mul(50))
        })

        it('success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18', async () => {
            await comptroller._setBaseRate(bigNumber17)
            await comptroller._setFloatRate(bigNumber17)
            expect(await comptroller.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(110))).to.eq(bigNumber18.mul(100))
        })

        it('success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18', async () => {
            await comptroller._setBaseRate(bigNumber17)
            await comptroller._setFloatRate(bigNumber17)
            await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5))
            expect(await comptroller.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(115))).to.eq(bigNumber18.mul(100))
        })
    })

})