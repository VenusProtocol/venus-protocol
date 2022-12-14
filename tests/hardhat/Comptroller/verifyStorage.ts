import { expect } from "chai";
import { ethers } from "hardhat";

import { Comptroller__factory } from "./../../../typechain";

const helpers = require("@nomicfoundation/hardhat-network-helpers");

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const Unitroller = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const zeroAddr = "0x0000000000000000000000000000000000000000";
const prevComp = "0xae8ba50ee0a0e55ec21bf4ffe2c48d2fdf52d3e6";
const BUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";

let owner,
  comptrollerV1,
  comptrollerV2,
  unitroller,
  maxAssets,
  closeFactorMantissa,
  liquidationIncentiveMantissa,
  venusRate,
  venusSupplyState,
  venusBorrowState,
  venusAccrued,
  vaiMintRate,
  supplyCaps,
  venusSpeeds;

describe("Verify Storage Collison", () => {
  // These tests checks the storage collision of comptroller while updating it.
  // Using mainnet comptroller fork to verify it.
  if (process.env.FORK_MAINNET === "true") {
    before("Get Deployed Contract", async () => {
      /*
       *  Forking mainnet
       * */
      await helpers.impersonateAccount(Owner);
      owner = await ethers.getSigner(Owner);

      /**
       *  sending gas cost to owner
       * */
      const [signer] = await ethers.getSigners();
      console.log("-- Sending gas cost to owner addr --");
      await signer.sendTransaction({
        to: owner.address,
        value: ethers.BigNumber.from("10000000000000000000"),
        data: undefined,
      });

      unitroller = await ethers.getContractAt("contracts/Comptroller/Unitroller.sol:Unitroller", Unitroller, owner);
    });
    describe("should match old admin address", async () => {
      it("Owner of unitroller deployed contract should match", async () => {
        const unitrollerAdmin = await unitroller.admin();
        const pendingAdmin = await unitroller.pendingAdmin();

        expect(unitrollerAdmin.toLowerCase()).to.equal(Owner);
        expect(pendingAdmin.toLowerCase()).to.equal(zeroAddr);
      });

      it("should match old Comptroller Address", async () => {
        const comptrollerImplementation = await unitroller.comptrollerImplementation();
        const pendingComptrollerImplementation = await unitroller.pendingComptrollerImplementation();

        expect(comptrollerImplementation.toLowerCase()).to.equal(prevComp);
        expect(pendingComptrollerImplementation.toLowerCase()).to.equal(zeroAddr);
      });
    });

    describe("save initial states of Comptroller Storage", async () => {
      it("Save all version 1 state", async () => {
        const [signer] = await ethers.getSigners();
        const compBySigner = Comptroller__factory.connect(unitroller.address, signer);

        maxAssets = await compBySigner.maxAssets();
        closeFactorMantissa = await compBySigner.closeFactorMantissa();
        liquidationIncentiveMantissa = await compBySigner.liquidationIncentiveMantissa();
        await compBySigner.allMarkets(0);
        await compBySigner.markets(BUSD);
        venusRate = await compBySigner.venusRate();
        venusSpeeds = await compBySigner.venusSpeeds(BUSD);
        venusSupplyState = await compBySigner.venusSupplyState(BUSD);
        venusBorrowState = await compBySigner.venusBorrowState(BUSD);
        venusAccrued = await compBySigner.venusAccrued(BUSD);
        vaiMintRate = await compBySigner.vaiMintRate();
        supplyCaps = await compBySigner.supplyCaps(BUSD);
      });
    });
    describe("deploy updatedComprtroller and verify previous states", async () => {
      it("deploy updatedComptroller", async () => {
        const ComptrollerV1 = await ethers.getContractFactory(
          "contracts/Comptroller/UpdatedComptroller.sol:UpdatedComptroller",
        );
        comptrollerV1 = await ComptrollerV1.deploy();
        await comptrollerV1.deployed();
        await unitroller.connect(owner)._setPendingImplementation(comptrollerV1.address);
        await comptrollerV1.connect(owner)._become(unitroller.address);
      });

      it("verify all version 1 state", async () => {
        const [signer] = await ethers.getSigners();
        const compBySigner = Comptroller__factory.connect(unitroller.address, signer);

        const maxAssetsV1 = await compBySigner.maxAssets();
        const closeFactorMantissaV1 = await compBySigner.closeFactorMantissa();
        const liquidationIncentiveMantissaV1 = await compBySigner.liquidationIncentiveMantissa();
        const allMarketsV1 = await compBySigner.allMarkets(0);
        const venusRateV1 = await compBySigner.venusRate();
        const venusSpeedsV1 = await compBySigner.venusSpeeds(BUSD);
        const venusSupplyStateV1 = await compBySigner.venusSupplyState(BUSD);
        const venusBorrowStateV1 = await compBySigner.venusBorrowState(BUSD);
        const venusAccruedV1 = await compBySigner.venusAccrued(BUSD);
        const vaiMintRateV1 = await compBySigner.vaiMintRate();
        const supplyCapsV1 = await compBySigner.supplyCaps(BUSD);
        const venusSupplySpeedsV1 = await compBySigner.venusSupplySpeeds(BUSD);

        expect(maxAssets).to.equal(maxAssetsV1);
        expect(liquidationIncentiveMantissa).to.equal(liquidationIncentiveMantissaV1);
        expect(closeFactorMantissa).to.equal(closeFactorMantissaV1);
        expect(allMarketsV1).to.equal(allMarketsV1);
        expect(venusRate).to.equal(venusRateV1);
        expect(venusSpeedsV1).to.equal(0);
        expect(venusSupplyState.index.toString()).to.equal(venusSupplyStateV1.index.toString());
        expect(venusBorrowState.index.toString()).to.equal(venusBorrowStateV1.index.toString());
        expect(venusAccrued).to.equal(venusAccruedV1);
        expect(vaiMintRate).to.equal(vaiMintRateV1);
        expect(supplyCaps).to.equal(supplyCapsV1);
        expect(venusSpeeds.toString()).to.equal(venusSupplySpeedsV1.toString());
      });
    });

    describe("deploy Comptroller and verify previous states", async () => {
      it("deploy updatedComptroller", async () => {
        const ComptrollerV2 = await ethers.getContractFactory("contracts/Comptroller/Comptroller.sol:Comptroller");
        comptrollerV2 = await ComptrollerV2.deploy();
        await comptrollerV2.deployed();
        await unitroller.connect(owner)._setPendingImplementation(comptrollerV2.address);
        await comptrollerV2.connect(owner)._become(unitroller.address);
      });

      it("verify all version 2 state", async () => {
        const [signer] = await ethers.getSigners();
        const compBySigner = Comptroller__factory.connect(unitroller.address, signer);

        const maxAssetsV2 = await compBySigner.maxAssets();
        const closeFactorMantissaV2 = await compBySigner.closeFactorMantissa();
        const liquidationIncentiveMantissaV2 = await compBySigner.liquidationIncentiveMantissa();
        const allMarketsV2 = await compBySigner.allMarkets(0);
        const venusRateV2 = await compBySigner.venusRate();
        const venusSpeedsV2 = await compBySigner.venusSpeeds(BUSD);
        const venusSupplyStateV2 = await compBySigner.venusSupplyState(BUSD);
        const venusBorrowStateV2 = await compBySigner.venusBorrowState(BUSD);
        const venusAccruedV2 = await compBySigner.venusAccrued(BUSD);
        const vaiMintRateV2 = await compBySigner.vaiMintRate();
        const supplyCapsV2 = await compBySigner.supplyCaps(BUSD);
        const venusSupplySpeedsV2 = await compBySigner.venusSupplySpeeds(BUSD);

        expect(maxAssets).to.equal(maxAssetsV2);
        expect(liquidationIncentiveMantissa).to.equal(liquidationIncentiveMantissaV2);
        expect(closeFactorMantissa).to.equal(closeFactorMantissaV2);
        expect(allMarketsV2).to.equal(allMarketsV2);
        expect(venusRate).to.equal(venusRateV2);
        expect(venusSpeedsV2).to.equal(0);
        expect(venusSupplyState.index.toString()).to.equal(venusSupplyStateV2.index.toString());
        expect(venusBorrowState.index.toString()).to.equal(venusBorrowStateV2.index.toString());
        expect(venusAccrued).to.equal(venusAccruedV2);
        expect(vaiMintRate).to.equal(vaiMintRateV2);
        expect(supplyCaps).to.equal(supplyCapsV2);
        expect(venusSpeeds.toString()).to.equal(venusSupplySpeedsV2.toString());
      });
    });
  }
});
